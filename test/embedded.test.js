"use strict";

import _ from 'lodash';
import fs from 'fs';
import { expect } from 'chai';
import { Database, Document, EmbeddedDocument } from '../src/index';
import { Data } from './data';
import { getData1, getData2, fail, validateId, expectError } from './util';
import { isDocument } from '../src/validate';
import { ValidationError } from '../src/errors';

describe('Embedded', function() {

    // TODO: Should probably use mock database client...
    var url = 'nedb://memory';
    //var url = 'mongodb://localhost/camo_test';
    var database = null;

    before(function(done) {
        Database.connect(url).then(function(db) {
            database = db;
            return database.dropDatabase();
        }).then(function() {
            return done();
        });
    });

    beforeEach(function(done) {
        done();
    });

    afterEach(function(done) {
        database.dropDatabase().then(function() {}).then(done, done);
    });

    after(function(done) {
        database.dropDatabase().then(function() {}).then(done, done);
    });

    describe('types', function() {
        it('should allow embedded types', function(done) {

            class EmbeddedModel extends EmbeddedDocument {
                constructor() {
                    super();
                    this.str = String;
                }
            }

            class DocumentModel extends Document {
                constructor() {
                    super();
                    this.mod = EmbeddedModel;
                    this.num = {
                        type: Number
                    };
                }
            }

            var data = DocumentModel.create();
            data.mod = EmbeddedModel.create();
            data.mod.str = 'some data';
            data.num = 1;

            data.save().then(function() {
                validateId(data);
                return DocumentModel.loadOne({
                    num: 1
                });
            }).then(function(d) {
                validateId(d);
                expect(d.num).to.be.equal(1);
                expect(d.mod).to.be.a('object');
                expect(d.mod).to.be.an.instanceof(EmbeddedModel);
                expect(d.mod.str).to.be.equal('some data');
            }).then(done, done);
        });

        it('should allow array of embedded types', function(done) {

            class Limb extends EmbeddedDocument {
                constructor() {
                    super();
                    this.type = String;
                }
            }

            class Person extends Document {
                constructor() {
                    super();
                    this.limbs = [Limb];
                    this.name = String;
                }

                static collectionName() {
                    return 'people';
                }
            }

            var person = Person.create();
            person.name = 'Scott';
            person.limbs.push(Limb.create());
            person.limbs[0].type = 'left arm';
            person.limbs.push(Limb.create());
            person.limbs[1].type = 'right arm';
            person.limbs.push(Limb.create());
            person.limbs[2].type = 'left leg';
            person.limbs.push(Limb.create());
            person.limbs[3].type = 'right leg';

            person.save().then(function() {
                validateId(person);
                expect(person.limbs).to.have.length(4);
                return Person.loadOne({
                    name: 'Scott'
                });
            }).then(function(p) {
                validateId(p);
                expect(p.name).to.be.equal('Scott');
                expect(p.limbs).to.be.a('array');
                expect(p.limbs).to.have.length(4);
                expect(p.limbs[0].type).to.be.equal('left arm');
                expect(p.limbs[1].type).to.be.equal('right arm');
                expect(p.limbs[2].type).to.be.equal('left leg');
                expect(p.limbs[3].type).to.be.equal('right leg');
            }).then(done, done);
        });

        it('should allow nested initialization of embedded types', function(done) {

            class Discount extends EmbeddedDocument {
                constructor() {
                    super();
                    this.authorized = Boolean;
                    this.amount = Number;
                }
            }

            class Product extends Document {
                constructor() {
                    super();
                    this.name = String;
                    this.discount = Discount;
                }
            }

            var product = Product.create({
                name: 'bike',
                discount: {
                    authorized: true,
                    amount: 9.99
                }
            });

            product.save().then(function() {
                validateId(product);
                expect(product.name).to.be.equal('bike');
                expect(product.discount).to.be.a('object');
                expect(product.discount instanceof Discount).to.be.true;
                expect(product.discount.authorized).to.be.equal(true);
                expect(product.discount.amount).to.be.equal(9.99);
            }).then(done, done);
        });

        it('should allow initialization of array of embedded documents', function(done) {

            class Discount extends EmbeddedDocument {
                constructor() {
                    super();
                    this.authorized = Boolean;
                    this.amount = Number;
                }
            }

            class Product extends Document {
                constructor() {
                    super();
                    this.name = String;
                    this.discounts = [Discount];
                }
            }

            var product = Product.create({
                name: 'bike',
                discounts: [{
                    authorized: true,
                    amount: 9.99
                },
                    {
                        authorized: false,
                        amount: 187.44
                    }]
            });

            product.save().then(function() {
                validateId(product);
                expect(product.name).to.be.equal('bike');
                expect(product.discounts).to.have.length(2);
                expect(product.discounts[0] instanceof Discount).to.be.true;
                expect(product.discounts[1] instanceof Discount).to.be.true;
                expect(product.discounts[0].authorized).to.be.equal(true);
                expect(product.discounts[0].amount).to.be.equal(9.99);
                expect(product.discounts[1].authorized).to.be.equal(false);
                expect(product.discounts[1].amount).to.be.equal(187.44);
            }).then(done, done);
        });
    });

    describe('defaults', function() {
        it('should assign defaults to embedded types', function(done) {

            class EmbeddedModel extends EmbeddedDocument {
                constructor() {
                    super();
                    this.str = {
                        type: String,
                        default: 'hello'
                    };
                }
            }

            class DocumentModel extends Document {
                constructor() {
                    super();
                    this.emb = EmbeddedModel;
                    this.num = {
                        type: Number
                    };
                }
            }

            var data = DocumentModel.create();
            data.emb = EmbeddedModel.create();
            data.num = 1;

            data.save().then(function() {
                validateId(data);
                return DocumentModel.loadOne({
                    num: 1
                });
            }).then(function(d) {
                validateId(d);
                expect(d.emb.str).to.be.equal('hello');
            }).then(done, done);
        });

        it('should assign defaults to array of embedded types', function(done) {

            class Money extends EmbeddedDocument {
                constructor() {
                    super();
                    this.value = {
                        type: Number,
                        default: 100
                    };
                }
            }

            class Wallet extends Document {
                constructor() {
                    super();
                    this.contents = [Money];
                    this.owner = String;
                }
            }

            var wallet = Wallet.create();
            wallet.owner = 'Scott';
            wallet.contents.push(Money.create());
            wallet.contents.push(Money.create());
            wallet.contents.push(Money.create());

            wallet.save().then(function() {
                validateId(wallet);
                return Wallet.loadOne({
                    owner: 'Scott'
                });
            }).then(function(w) {
                validateId(w);
                expect(w.owner).to.be.equal('Scott');
                expect(w.contents[0].value).to.be.equal(100);
                expect(w.contents[1].value).to.be.equal(100);
                expect(w.contents[2].value).to.be.equal(100);
            }).then(done, done);
        });
    });

    describe('validate', function() {

        it('should validate embedded values', function(done) {

            class EmbeddedModel extends EmbeddedDocument {
                constructor() {
                    super();
                    this.num = {
                        type: Number,
                        max: 10
                    };
                }
            }

            class DocumentModel extends Document {
                constructor() {
                    super();
                    this.emb = EmbeddedModel;
                }
            }

            var data = DocumentModel.create();
            data.emb = EmbeddedModel.create();
            data.emb.num = 26;

            data.save().then(function() {
                expect.fail(null, Error, 'Expected error, but got none.');
            }).catch(function(error) {
                expect(error).to.be.instanceof(ValidationError);
                expect(error.message).to.contain('max');
            }).then(done, done);
        });

        it('should validate array of embedded values', function(done) {

            class Money extends EmbeddedDocument {
                constructor() {
                    super();
                    this.value = {
                        type: Number,
                        choices: [1, 5, 10, 20, 50, 100]
                    };
                }
            }

            class Wallet extends Document {
                constructor() {
                    super();
                    this.contents = [Money];
                }
            }

            var wallet = Wallet.create();
            wallet.contents.push(Money.create());
            wallet.contents[0].value = 5;
            wallet.contents.push(Money.create());
            wallet.contents[1].value = 26;

            wallet.save().then(function() {
                expect.fail(null, Error, 'Expected error, but got none.');
            }).catch(function(error) {
                expect(error).to.be.instanceof(ValidationError);
                expect(error.message).to.contain('choices');
            }).then(done, done);
        });

    });

    describe('canonicalize', function() {
        it('should ensure timestamp dates are converted to Date objects', function(done) {
            class Education extends EmbeddedDocument {
                constructor() {
                    super();

                    this.school = String;
                    this.major = String;
                    this.dateGraduated = Date;
                }

                static collectionName() {
                    return 'people';
                }
            }

            class Person extends Document {
                constructor() {
                    super();

                    this.gradSchool = Education;
                }

                static collectionName() {
                    return 'people';
                }
            }

            var now = new Date();

            var person = Person.create({
                gradSchool: {
                    school: 'CMU',
                    major: 'ECE',
                    dateGraduated: now
                }
            });

            person.save().then(function() {
                validateId(person);
                expect(person.gradSchool.school).to.be.equal('CMU');
                expect(person.gradSchool.dateGraduated.getFullYear()).to.be.equal(now.getFullYear());
                expect(person.gradSchool.dateGraduated.getHours()).to.be.equal(now.getHours());
                expect(person.gradSchool.dateGraduated.getMinutes()).to.be.equal(now.getMinutes());
                expect(person.gradSchool.dateGraduated.getMonth()).to.be.equal(now.getMonth());
                expect(person.gradSchool.dateGraduated.getSeconds()).to.be.equal(now.getSeconds());
            }).then(done, done);
        });
    });

    describe('hooks', function() {

        it('should call all pre and post functions on embedded models', function(done) {

            var preValidateCalled = false;
            var preSaveCalled = false;
            var preDeleteCalled = false;

            var postValidateCalled = false;
            var postSaveCalled = false;
            var postDeleteCalled = false;

            class Coffee extends EmbeddedDocument {
                constructor() {
                    super();
                }

                preValidate() {
                    preValidateCalled = true;
                }

                postValidate() {
                    postValidateCalled = true;
                }

                preSave() {
                    preSaveCalled = true;
                }

                postSave() {
                    postSaveCalled = true;
                }

                preDelete() {
                    preDeleteCalled = true;
                }

                postDelete() {
                    postDeleteCalled = true;
                }
            }

            class Cup extends Document {
                constructor() {
                    super();

                    this.contents = Coffee;
                }
            }

            var cup = Cup.create();
            cup.contents = Coffee.create();

            cup.save().then(function() {
                validateId(cup);

                // Pre/post save and validate should be called
                expect(preValidateCalled).to.be.equal(true);
                expect(preSaveCalled).to.be.equal(true);
                expect(postValidateCalled).to.be.equal(true);
                expect(postSaveCalled).to.be.equal(true);

                // Pre/post delete should not have been called yet
                expect(preDeleteCalled).to.be.equal(false);
                expect(postDeleteCalled).to.be.equal(false);

                return cup.delete();
            }).then(function(numDeleted) {
                expect(numDeleted).to.be.equal(1);

                expect(preDeleteCalled).to.be.equal(true);
                expect(postDeleteCalled).to.be.equal(true);
            }).then(done, done);
        });

        it('should call all pre and post functions on array of embedded models', function(done) {

            var preValidateCalled = false;
            var preSaveCalled = false;
            var preDeleteCalled = false;

            var postValidateCalled = false;
            var postSaveCalled = false;
            var postDeleteCalled = false;

            class Money extends EmbeddedDocument {
                constructor() {
                    super();
                }

                preValidate() {
                    preValidateCalled = true;
                }

                postValidate() {
                    postValidateCalled = true;
                }

                preSave() {
                    preSaveCalled = true;
                }

                postSave() {
                    postSaveCalled = true;
                }

                preDelete() {
                    preDeleteCalled = true;
                }

                postDelete() {
                    postDeleteCalled = true;
                }
            }

            class Wallet extends Document {
                constructor() {
                    super();

                    this.contents = [Money];
                }
            }

            var wallet = Wallet.create();
            wallet.contents.push(Money.create());
            wallet.contents.push(Money.create());

            wallet.save().then(function() {
                validateId(wallet);

                // Pre/post save and validate should be called
                expect(preValidateCalled).to.be.equal(true);
                expect(preSaveCalled).to.be.equal(true);
                expect(postValidateCalled).to.be.equal(true);
                expect(postSaveCalled).to.be.equal(true);

                // Pre/post delete should not have been called yet
                expect(preDeleteCalled).to.be.equal(false);
                expect(postDeleteCalled).to.be.equal(false);

                return wallet.delete();
            }).then(function(numDeleted) {
                expect(numDeleted).to.be.equal(1);

                expect(preDeleteCalled).to.be.equal(true);
                expect(postDeleteCalled).to.be.equal(true);
            }).then(done, done);
        });
    });

    describe('serialize', function() {
        it('should serialize data to JSON', function(done) {
            class Address extends EmbeddedDocument {
                constructor() {
                    super();

                    this.street = String;
                    this.city = String;
                    this.zipCode = Number;
                    this.isPoBox = Boolean;
                }
            }

            class Person extends Document {
                constructor() {
                    super();

                    this.name = String;
                    this.age = Number;
                    this.isAlive = Boolean;
                    this.children = [String];
                    this.address = Address;
                }

                static collectionName() {
                    return 'people';
                }
            }

            var person = Person.create({
                name: 'Scott',
                address: {
                    street: '123 Fake St.',
                    city: 'Cityville',
                    zipCode: 12345,
                    isPoBox: false
                }
            });

            person.save().then(function() {
                validateId(person);
                expect(person.name).to.be.equal('Scott');
                expect(person.address).to.be.an.instanceof(Address);
                expect(person.address.street).to.be.equal('123 Fake St.');
                expect(person.address.city).to.be.equal('Cityville');
                expect(person.address.zipCode).to.be.equal(12345);
                expect(person.address.isPoBox).to.be.equal(false);

                var json = person.toJSON();

                expect(json.name).to.be.equal('Scott');
                expect(json.address).to.not.be.an.instanceof(Address);
                expect(json.address.street).to.be.equal('123 Fake St.');
                expect(json.address.city).to.be.equal('Cityville');
                expect(json.address.zipCode).to.be.equal(12345);
                expect(json.address.isPoBox).to.be.equal(false);
            }).then(done, done);
        });
    });
});
