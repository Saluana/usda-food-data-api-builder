import mongoose from "mongoose";

interface DocCacheMap {
  [key: string]: mongoose.Document[];
}

/**
 * Queues Documents and nested Documents for batch insertion via
 * `insertMany`
 */
export class DocumentBatcher {
  private limit: number;
  private count: number = 0;
  private cache: DocCacheMap = {};
  private lock: boolean = false;

  /**
   * Configures the DocumentBatcher
   * @param limit The number of root level documents to queue
   */
  constructor(limit: number = 1000) {
    this.limit = limit;
  }

  /**
   * Queues a document in the given collection for an insertMany operation
   * @param name The collection name
   * @param doc The document to queue for batch insert
   */
  add(name: string, doc: mongoose.Document) {
    if (!this.cache[name]) {
      this.cache[name] = [];
    }
    this.cache[name].push(doc);
  }

  /**
   * Waits for the current save to finish, if saving
   */
  async waitForLock() {
    await new Promise((resolve) => {
      const interval = setInterval(() => {
        if (!this.lock) {
          clearInterval(interval);
          resolve("");
        }
      }, 10);
    });
  }

  /**
   * Saves and empties the document queue
   */
  async save() {
    try {
      await this.waitForLock();

      this.lock = true;
      this.count = 0;

      let promises = [];
      for (let n in this.cache) {
        let docs = this.cache[n];
        console.log(`Saving ${docs.length} documents to ${n}`);
        promises.push(mongoose.model(n).insertMany(docs));
      }

      this.cache = {};

      Promise.allSettled(promises).then(() => {
        this.lock = false;
      });
    } catch (e) {
      this.lock = false;
      console.log("Error saving documents");
    }
  }

  /**
   * Returns if the object batcher is allowing new entries
   * @returns true if allowed, else false
   */
  allow() {
    if (this.count + 1 < this.limit) {
      this.count++;
      return true;
    }
    return false;
  }
}
