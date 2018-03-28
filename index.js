import _ from 'lodash';
import RNFetchBlob from 'react-native-fetch-blob';
import Queue from 'double-ended-queue';

// Task:
// {
//   url: string,
//   path: string,
// }
// Resp: {
//   status: 'OK'|'FAIL'|'CANCEL',
//   url,
//   path?
//   error?
// }
// Request: { cancellable: { cancel: (callback) => void } } }

export default class DownloadQueue {
  // public
  constructor(options) {
    this.options = options;
    this.reset();
  }

  async download(task) {
    const { url, path } = task;
    return new Promise((resolve, reject) => {
      const t = {
        url,
        path,
        resolve,
        reject,
      };
      this.addTask(t);
      this.taskQueue.push(t);
      this.downloadNext();
    });
  }

  hasDownload(url) {
    return !!this.tasks[url];
  }

  cancelDownloads() {
    while (this.taskQueue.length) {
      const { reject } = this.shift();
      reject({ status: 'CANCEL' });
    }

    this.requests.forEach((req) => {
      if (!req) {
        return;
      }
      req.cancel();
    });

    this.reset();
  }

  // private
  get concurrency() {
    return this.options.concurrency;
  }

  reset() {
    this.requests = _.range(this.concurrency).map(() => null);
    this.taskQueue = new Queue();
    this.tasks = {};
  }

  shift() {
    return this.taskQueue.shift();
  }

  addTask(task) {
    this.tasks[task.url] = task;
  }

  deleteTask(task) {
    if (this.tasks[task.url] === task) {
      delete this.tasks[task.url];
    }
  }

  async downloadNext() {
    if (!this.taskQueue.length) {
      return;
    }

    const { requests } = this;
    const index = requests.indexOf(null);
    if (index === -1) {
      return;
    }

    const task = this.shift();
    const { url, path, resolve, reject } = task;

    let cancellable = null;
    try {
      cancellable = RNFetchBlob.config({ path }).fetch('GET', url);
      requests[index] = cancellable;
      const resp = await cancellable;
      resolve({ status: 'OK', url, path: resp.path() });
    } catch (e) {
      console.error('failed to fetch url, e: ', url, e);
      reject({ status: 'FAIL', url, error: e });
    } finally {
      if (requests[index] === cancellable) {
        requests[index] = null;
      }
      this.deleteTask(task);
      this.downloadNext();
    }
  }
}
