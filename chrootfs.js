var fs = require('fs-extra');
var Path = require('path');
const klaw = require('klaw');
const _ = require('lodash');

class CBPromise {
  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

class UnsafePath extends Error {}
class TooBigError extends Error {}

// Get the current size being taken by a directory.
function getDirSize(path) {
  // Adapted from http://stackoverflow.com/questions/7529228/how-to-get-totalsize-of-files-in-directory
  return new Promise((resolve, reject) => {
    fs.lstat(path, (err, stats) => {
      if (err) {
        reject(err)
      } else if (stats.isDirectory()) {
        let total = stats.size;
        fs.readdir(path, (err, list) => {
          if (err) {
            reject(err);
          } else {
            Promise.all(_.map(list, subdir => {
              return getDirSize(Path.join(path, subdir));
            }))
              .then(sizes => {
                resolve(_.sum(sizes) + total);
              })
              .catch(err => {
                reject(err);
              })
          }
        });
      } else {
        resolve(stats.size);
      }
    })
  })
}

class ChrootFS {
  constructor(path, options) {
    options = options || {};
    this._root = null;
    this._tmp_root = Path.resolve(path);
    this.maxBytes = options.maxBytes || (10 * 2 ** 20);
  }
  _getRoot() {
    if (this._root) {
      return Promise.resolve(this._root);
    } else {
      return new Promise((resolve, reject) => {
        fs.realpath(this._tmp_root, (err, resolvedPath) => {
          if (err) {
            reject(err);
          } else {
            this._root = resolvedPath;
            resolve(this._root);
          }
        })
      })
    }
  }
  _getPath(relpath) {
    // Turn a path relative to the root of the chroot
    // into an absolute-to-the-filesystem path.
    // Throws a UnsafePath if the path is outside the chroot.
    return this._getRoot()
    .then(root => {
      return safe_join(root, relpath);
    });
  }
  writeFile(path, data) {
    return this._getPath(path)
    .then(abspath => {
      // XXX check that the amount of data being written is okay.
      // For now, we're going to stat every file every time, but in
      // the future, perhaps we could cache some information.
      return getDirSize(this._root)
        .then(size => {
          let projected_size = size + data.length;
          if (projected_size > this.maxBytes) {
            throw new TooBigError("This operation will exceed the max size of " + this.maxBytes);
          } else {
            return abspath;
          }
        })
    })
    .then(abspath => {
      return new Promise((resolve, reject) => {
        fs.ensureDir(Path.dirname(abspath), (err) => {
          resolve(err)
        })
      })
      .then(() => {
        return new Promise((resolve, reject) => {
          fs.writeFile(abspath, data, null, (err) => {
            resolve(err);
          });  
        })
      });
    });
  }
  readFile(path) {
    return this._getPath(path)
    .then(abspath => {
      return new Promise((resolve, reject) => {
        fs.readFile(abspath, (err, data) => {
          if (err) {
            reject(err);
          } else {
            resolve(data);
          }
        }); 
      })
    })
  }
  listdir() {
    return this._getRoot()
    .then(root => {
      return new Promise((resolve, reject) => {
        let items = [];
        klaw(root)
          .on('readable', function() {
            let item;
            while (item = this.read()) {
              let path = Path.relative(root, item.path);
              if (path === '') {
                // root
                continue
              }
              let dirname = Path.dirname(path);
              if (dirname === '.') {
                dirname = '';
              }
              let res = {
                name: Path.basename(path),
                path: path,
                dir: dirname,
                size: item.stats.size,
              }
              if (item.stats.isDirectory()) {
                res.isdir = true;
              }
              items.push(res);
            }
          })
          .on('error', (err, item) => {
            console.error('error', err, item);
          })
          .on('end', () => {
            resolve(items);
          })
      });
    })
  }
  remove(path) {
    return this._getPath(path)
    .then(abspath => {
      return new Promise((resolve, reject) => {
        fs.remove(abspath, (err) => {
          if (err) {
            reject(err)
          } else {
            resolve(null);
          }
        });
      });
    })
  }
}

function is_string_path_within(root, child) {
  // Return true if absolute child path string is a child of absolute root path string
  // This just does string comparison.
  // You are expected to make root and child absolute.
  if (root === child || (root + Path.sep) === child || root === (child + Path.sep)) {
    return true;
  } else if (child.startsWith(root + Path.sep)) {
    return true;
  } else {
    return false
  }
}

function resolve_path(x) {
  return new Promise((resolve, reject) => {  
    fs.realpath(x, (err, resolvedPath) => {
      if (err) {
        if (err.code === "ENOENT") {
          // file does not exist
          resolve({
            exists: false,
            path: x,
            orig: x,
          });
        } else {
          // some other error
          reject(err);
        }
      } else {
        // file exists
        resolve({
          exists: true,
          path: resolvedPath,
          orig: x,
        });
      }
    })
  });
}


function safe_join() {
  let base = Path.normalize(arguments[0]);
  let rest = [].slice.call(arguments).slice(1);

  // Resolve the relative path
  rest = Path.normalize(Path.join(...rest));
  if (Path.isAbsolute(rest)) {
    rest = Path.relative(Path.dirname(rest), rest);
  }
  let alleged_path = Path.resolve(base, rest);

  let resolved_path = resolve_path(alleged_path);
  let resolved_base = resolve_path(base);

  return Promise.all([resolved_base, resolved_path])
  .then(result => {
    let r_base = result[0];
    let r_path = result[1];
    if (r_base.exists) {
      if (r_path.exists) {
        if (is_string_path_within(r_base.path, r_path.path)) {
          return r_path.orig;
        }
      } else {
        if (is_string_path_within(r_base.orig, r_path.path)
          || is_string_path_within(r_base.path, r_path.path)) {
          return r_path.path;
        }
      }
    } else {
      // root doesn't exist
      if (is_string_path_within(r_base.path, r_path.path)) {
        return r_path.path;
      }
    }
    throw new UnsafePath(r_path.orig + ' is outside base dir.');
  });
}


module.exports = {ChrootFS, TooBigError, safe_join};
