"use strict";

import _ from 'lodash';
import { Connection as DB } from './db';
import { isSupportedType, isValidType, isInChoices, isArray, isDocument, isEmbeddedDocument, isString, isNumber} from './validate';

var normalizeType = function(property) {
    // TODO: Only copy over stuff we support

    var typeDeclaration = {};
    if (property.type) {
        typeDeclaration = property;
    } else if (isSupportedType(property)) {
        typeDeclaration.type = property;
    } else {
        throw new Error('Unsupported type or bad variable. ' + 
            'Remember, non-persisted objects must start with an underscore (_). Got:', property);
    }

    return typeDeclaration;
};


export class BaseDocument {
	constructor() {
        this._schema = {                            // Defines document structure/properties
            _id: { type: DB().nativeIdType() },     // Native ID to backend database
        };
        this._values = {};                          // Contains values for properties defined in schema
    }

    // TODO: Is there a way to tell if a class is
    // a subclass of something? Until I find out
    // how, we'll be lazy use this.
    static documentClass() {
        throw new TypeError('You must override documentClass (static).');
    }

    documentClass() {
        throw new TypeError('You must override documentClass.');
    }

    get id() {
    	return this._values._id;
    }

    set id(id) {
    	this._values._id = id;
    }

    schema(extension) {
        if (!extension) return;
        _.keys(extension).forEach(function(k) {
            extension[k] = normalizeType(extension[k]);
        });
        _.assign(this._schema, extension);
    }

    /*
     * Pre/post Hooks
     *
     * To add a hook, the extending class just needs
     * to override the appropriate hook method below.
     */

    preValidate() { }

    postValidate() { }

    preSave() { }

    postSave() { }

    preDelete() { }

    postDelete() { }

    // TODO : EMBEDDED
    // Need to share this with embedded
    generateSchema() {
        _.keys(this).forEach((k) => {
            // Ignore private variables
            if (_.startsWith(k, '_')) {
                return;
            }

            // Normalize the type format
            this._schema[k] = normalizeType(this[k]);

            // Assign a default if needed
            if (isArray(this._schema[k].type)) {
                this._values[k] = this.getDefault(k) || [];
            } else {
                this._values[k] = this.getDefault(k);
            }
            
            this._proxy(k);
        });
        this._proxy('id');
    }
    
    _proxy(field){
        Object.defineProperty(this, field, {
            get: function() {
                // Return current value, if set
                if (field in this._values) {
                    return this._values[field];
                }
                // Alias 'id' and '_id'
                if (field === 'id') {
                    return this._values._id;
                }
                return this[field];
            },
            set: function(value) {
                if (field in this._schema) {
                    this._values[field] = value;
                    return true;
                }
                // Alias 'id' and '_id'
                if (field === 'id') {
                    this._values._id = value;
                    return true;
                }
                return false;
            },
            configurable: true,
            enumerable: true
        });
    }

    validate() {
        var that = this;

        _.keys(that._values).forEach(function(key) {
            var value = that._values[key];

            // TODO: This should probably be in Document, not BaseDocument
            if (value !== null && value !== undefined && 
                value.documentClass && value.documentClass() === 'embedded') {
                value.validate();
                return;
            }

            if (!isValidType(value, that._schema[key].type)) {
                // TODO: Formatting should probably be done somewhere else
                var typeName = null;
                var valueName = null;
                if (Array.isArray(that._schema[key].type)) {
                    typeName = '[' + that._schema[key].type[0].name + ']';
                } else {
                    typeName = that._schema[key].type.name;
                }

                if (Array.isArray(value)) {
                    // TODO: Not descriptive enough! Strings can look like numbers
                    valueName = '[' + value.toString() + ']';
                } else {
                    valueName = typeof(value);
                }
                throw new Error('Value assigned to ' + that._meta.collection + '.' + key +
                    ' should be ' + typeName + ', got ' + valueName);
            }

            if (that._schema[key].match && isString(value) && !that._schema[key].match.test(value)) {
                throw new Error('Value assigned to ' + that._meta.collection + '.' + key +
                    ' does not match the regex/string ' + that._schema[key].match.toString() + '. Value was ' + value);
            }

            if (!isInChoices(that._schema[key].choices, value)) {
                throw new Error('Value assigned to ' + that._meta.collection + '.' + key +
                    ' should be in [' + that._schema[key].choices.join(', ') + '], got ' + value);
            }

            if (that._schema[key].min && value < that._schema[key].min) {
                throw new Error('Value assigned to ' + that._meta.collection + '.' + key +
                    ' is less than min, ' + that._schema[key].min + ', got ' + value);
            }

            if (that._schema[key].max && value > that._schema[key].max) {
                throw new Error('Value assigned to ' + that._meta.collection + '.' + key +
                    ' is less than max, ' + that._schema[key].max + ', got ' + value);
            }
        });
    }

    /*
     * Right now this only canonicalizes dates (integer timestamps
     * get converted to Date objects), but maybe we should do the
     * same for strings (UTF, Unicode, ASCII, etc)?
     */
    canonicalize() {
        var that = this;

        _.keys(that._values).forEach(function(key) {
            var value = that._values[key];
            
            if (that._schema[key].type === Date && isNumber(value)) {
                that._values[key] = new Date(value);
            } else if (value !== null && value !== undefined && 
                value.documentClass && value.documentClass() === 'embedded') {
                // TODO: This should probably be in Document, not BaseDocument
                value.canonicalize();
                return;
            }
        });
    }

    static create(data) {
        if (typeof(data) !== 'undefined') {
            return this._fromData(data);
        }
        return this._instantiate();
    }

    static _instantiate() {
        var instance = new this();
        instance.generateSchema();
        return instance;
    }

    // TODO: Should probably move some of this to 
    // Embedded and Document classes since Base shouldn't
    // need to know about child classes
    static _fromData(datas) {
        var that = this;

        if (!isArray(datas)) {
            datas = [datas];
        }

        var documents = [];
        var embeddedPromises = [];
        datas.forEach(function(d) {
            var instance = that._instantiate();
            _.keys(d).forEach(function(key) {

                var value = null;
                if (d[key] === null) {
                    value = instance.getDefault(key);
                } else {
                    value = d[key];
                }

                // If its not in the schema, we don't care about it... right?
                if (key in instance._schema) {
                    var type = instance._schema[key].type;

                    if (type.documentClass && type.documentClass() === 'embedded') {
                        instance._values[key] = type._fromData(value);
                    } else {
                        instance._values[key] = value;
                    }
                } else if (key in instance) {
                    // Handles virtual setters
                    instance[key] = value;
                }
            });

            documents.push(instance);
        });

        if (documents.length === 1) {
            return documents[0];
        }
        return documents;
    }

    populate() {
        return BaseDocument.populate(this);
    }

    // TODO : EMBEDDED
    // 
    static populate(docs) {
        if (!docs) return Promise.all([]);

        let documents = null;

        if (!isArray(docs)) {
            documents = [docs];
        } else if (docs.length < 1) {
            return Promise.all(docs);
        } else {
            documents = docs;
        }

        // Load all 1-level-deep references
        // First, find all unique keys needed to be loaded...
        let keys = [];

        // TODO: Bad assumption: Not all documents in the database will have the same schema...
        // Hmm, if this is true, thats an error on the user. Right?
        let anInstance = documents[0];
        _.keys(anInstance._schema).forEach( (key) => {
            // Handle array of references (ex: { type: [MyObject] })
            if (isArray(anInstance._schema[key].type) &&
                anInstance._schema[key].type.length > 0 &&
                isDocument(anInstance._schema[key].type[0])) {
                keys.push(key);
            }
            // Handle anInstance[key] being a string id, a native id, or a Document instance
            else if ((isString(anInstance[key]) || DB().isNativeId(anInstance[key])) &&
                     isDocument(anInstance._schema[key].type)) {
                keys.push(key);
            }
        });

        // ...then get all ids for each type of reference to be loaded...
        // ids = {
        //      houses: {
        //          'abc123': ['ak23lj', '2kajlc', 'ckajl32'],
        //          'l2jo99': ['28dsa0']
        //      },
        //      friends: {
        //          '1039da': ['lj0adf', 'k2jha']
        //      }
        //}
        let ids = {};
        keys.forEach(function(k) {
            ids[k] = {};
            documents.forEach(function(d) {
                ids[k][DB().toCanonicalId(d.id)] = [].concat(d[k]);     // Handles values and arrays

                // Also, initialize document member arrays
                // to assign to later if needed
                if (isArray(d[k])) {
                    d[k] = [];
                }
            });
        });
        
        // TODO: Is this really the most efficient
        // way to do this? Maybe make a master list
        // of all objects that need to be loaded (separated
        // by type), load those, and then search through
        // ids to see where dereferenced objects should
        // go?

        // ...then for each array of ids, load them all...
        let loadPromises = [];
        _.keys(ids).forEach(function(key) {
            let keyIds = [];
            _.keys(ids[key]).forEach(function(k) {
                // Before adding to list, we convert id to the
                // backend database's native ID format.
                keyIds = keyIds.concat(ids[key][k]);
            });

            // Only want to load each reference once
            keyIds = _.unique(keyIds);

            // Handle array of references (like [MyObject])
            let type = null;
            if (isArray(anInstance._schema[key].type)) {
                type = anInstance._schema[key].type[0];
            } else {
                type = anInstance._schema[key].type;
            }

            // Bulk load dereferences
            let p = type.loadMany({ '_id': { $in: keyIds } }, { populate: false })
            .then(function(dereferences) {
                // Assign each dereferenced object to parent

                _.keys(ids[key]).forEach(function(k) {
                    // TODO: Replace with documents.find when able
                    // Find the document to assign the derefs to
                    let doc;
                    documents.forEach(function(d) {
                        if (DB().toCanonicalId(d.id) === k) doc = d;
                    });

                    // For all ids to be dereferenced, find the
                    // deref and assign or push it
                    ids[key][k].forEach(function(id) {
                        // TODO: Replace with dereferences.find when able
                        // Find the right dereference
                        let deref;
                        dereferences.forEach(function(d) {
                            if (DB().toCanonicalId(d.id) === DB().toCanonicalId(id)) deref = d;
                        });

                        if (isArray(anInstance._schema[key].type)) {
                            doc[key].push(deref);
                        } else {
                            doc[key] = deref;
                        }
                    });
                });
            });

            loadPromises.push(p);
        });
        
        // ...and finally execute all promises and return our
        // fully loaded documents.
        return Promise.all(loadPromises).then(function() {
            return docs;
        });
    }

    getDefault(schemaProp) {
        if (schemaProp in this._schema && 'default' in this._schema[schemaProp]) {
            var def = this._schema[schemaProp].default;
            var defVal = typeof(def) === 'function' ? def() : def;
            this._values[schemaProp] = defVal;  // TODO: Wait... should we be assigning it here?
            return defVal;
        }

        return null;
    }

    
}