'use strict';

const { expect } = require('chai');
const Sinon = require('sinon');
const { Promise: BluebirdPromise } = require('bluebird');
const { PromiseProvider } = require('../../../src/promise_provider');

describe('Cursor Async Iterator Tests', function () {
  context('default promise library', function () {
    let client, collection;
    before(async function () {
      client = this.configuration.newClient();

      await client.connect();
      const docs = Array.from({ length: 1000 }).map((_, index) => ({ foo: index, bar: 1 }));

      collection = client.db(this.configuration.db).collection('async_cursor_tests');

      await collection.deleteMany({});
      await collection.insertMany(docs);
      await client.close();
    });

    beforeEach(async function () {
      client = this.configuration.newClient();
      await client.connect();
      collection = client.db(this.configuration.db).collection('async_cursor_tests');
    });

    afterEach(() => client.close());

    it('should be able to use a for-await loop on a find command cursor', async function () {
      const cursor = collection.find({ bar: 1 });

      let counter = 0;
      for await (const doc of cursor) {
        expect(doc).to.have.property('bar', 1);
        counter += 1;
      }

      expect(counter).to.equal(1000);
    });

    it('should be able to use a for-await loop on an aggregation cursor', async function () {
      const cursor = collection.aggregate([{ $match: { bar: 1 } }]);

      let counter = 0;
      for await (const doc of cursor) {
        expect(doc).to.have.property('bar', 1);
        counter += 1;
      }

      expect(counter).to.equal(1000);
    });

    it('should be able to use a for-await loop on a command cursor', {
      metadata: { requires: { mongodb: '>=3.0.0' } },
      test: async function () {
        const cursor1 = collection.listIndexes();
        const cursor2 = collection.listIndexes();

        const indexes = await cursor1.toArray();
        let counter = 0;
        for await (const doc of cursor2) {
          expect(doc).to.exist;
          counter += 1;
        }

        expect(counter).to.equal(indexes.length);
      }
    });

    it('should properly stop when cursor is closed', async function () {
      const cursor = collection.find();

      let count = 0;
      for await (const doc of cursor) {
        expect(doc).to.exist;
        count++;
        await cursor.close();
      }

      expect(count).to.equal(1);
    });
  });
  context('custom promise library', () => {
    let client, collection, promiseSpy;
    beforeEach(async function () {
      promiseSpy = Sinon.spy(BluebirdPromise.prototype, 'then');
      client = this.configuration.newClient({}, { promiseLibrary: BluebirdPromise });

      const connectPromise = client.connect();
      expect(connectPromise).to.be.instanceOf(BluebirdPromise);
      await connectPromise;
      const docs = Array.from({ length: 1 }).map((_, index) => ({ foo: index, bar: 1 }));

      collection = client.db(this.configuration.db).collection('async_cursor_tests');

      await collection.deleteMany({});
      await collection.insertMany(docs);
      await client.close();
    });

    beforeEach(async function () {
      client = this.configuration.newClient();
      await client.connect();
      collection = client.db(this.configuration.db).collection('async_cursor_tests');
    });

    afterEach(() => {
      promiseSpy.restore();
      PromiseProvider.set(null);
      return client.close();
    });

    it('should properly use custom promise', async function () {
      const cursor = collection.find();
      const countBeforeIteration = promiseSpy.callCount;
      for await (const doc of cursor) {
        expect(doc).to.exist;
      }
      expect(countBeforeIteration).to.not.equal(promiseSpy.callCount);
      expect(promiseSpy.called).to.equal(true);
    });

    it('should properly use custom promise manual iteration', async function () {
      const cursor = collection.find();

      const iterator = cursor[Symbol.asyncIterator]();
      let isDone;
      do {
        const promiseFromIterator = iterator.next();
        expect(promiseFromIterator).to.be.instanceOf(BluebirdPromise);
        const { done, value } = await promiseFromIterator;
        if (done) expect(value).to.be.a('undefined');
        isDone = done;
      } while (!isDone);
    });
  });
});
