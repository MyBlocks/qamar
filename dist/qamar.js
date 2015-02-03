/*!
 * async
 * https://github.com/caolan/async
 *
 * Copyright 2010-2014 Caolan McMahon
 * Released under the MIT license
 */
/*jshint onevar: false, indent:4 */
/*global setImmediate: false, setTimeout: false, console: false */
(function () {

    var async = {};

    // global on the server, window in the browser
    var root, previous_async;

    root = this;
    if (root != null) {
      previous_async = root.async;
    }

    async.noConflict = function () {
        root.async = previous_async;
        return async;
    };

    function only_once(fn) {
        var called = false;
        return function() {
            if (called) throw new Error("Callback was already called.");
            called = true;
            fn.apply(root, arguments);
        }
    }

    //// cross-browser compatiblity functions ////

    var _toString = Object.prototype.toString;

    var _isArray = Array.isArray || function (obj) {
        return _toString.call(obj) === '[object Array]';
    };

    var _each = function (arr, iterator) {
        if (arr.forEach) {
            return arr.forEach(iterator);
        }
        for (var i = 0; i < arr.length; i += 1) {
            iterator(arr[i], i, arr);
        }
    };

    var _map = function (arr, iterator) {
        if (arr.map) {
            return arr.map(iterator);
        }
        var results = [];
        _each(arr, function (x, i, a) {
            results.push(iterator(x, i, a));
        });
        return results;
    };

    var _reduce = function (arr, iterator, memo) {
        if (arr.reduce) {
            return arr.reduce(iterator, memo);
        }
        _each(arr, function (x, i, a) {
            memo = iterator(memo, x, i, a);
        });
        return memo;
    };

    var _keys = function (obj) {
        if (Object.keys) {
            return Object.keys(obj);
        }
        var keys = [];
        for (var k in obj) {
            if (obj.hasOwnProperty(k)) {
                keys.push(k);
            }
        }
        return keys;
    };

    //// exported async module functions ////

    //// nextTick implementation with browser-compatible fallback ////
    if (typeof process === 'undefined' || !(process.nextTick)) {
        if (typeof setImmediate === 'function') {
            async.nextTick = function (fn) {
                // not a direct alias for IE10 compatibility
                setImmediate(fn);
            };
            async.setImmediate = async.nextTick;
        }
        else {
            async.nextTick = function (fn) {
                setTimeout(fn, 0);
            };
            async.setImmediate = async.nextTick;
        }
    }
    else {
        async.nextTick = process.nextTick;
        if (typeof setImmediate !== 'undefined') {
            async.setImmediate = function (fn) {
              // not a direct alias for IE10 compatibility
              setImmediate(fn);
            };
        }
        else {
            async.setImmediate = async.nextTick;
        }
    }

    async.each = function (arr, iterator, callback) {
        callback = callback || function () {};
        if (!arr.length) {
            return callback();
        }
        var completed = 0;
        _each(arr, function (x) {
            iterator(x, only_once(done) );
        });
        function done(err) {
          if (err) {
              callback(err);
              callback = function () {};
          }
          else {
              completed += 1;
              if (completed >= arr.length) {
                  callback();
              }
          }
        }
    };
    async.forEach = async.each;

    async.eachSeries = function (arr, iterator, callback) {
        callback = callback || function () {};
        if (!arr.length) {
            return callback();
        }
        var completed = 0;
        var iterate = function () {
            iterator(arr[completed], function (err) {
                if (err) {
                    callback(err);
                    callback = function () {};
                }
                else {
                    completed += 1;
                    if (completed >= arr.length) {
                        callback();
                    }
                    else {
                        iterate();
                    }
                }
            });
        };
        iterate();
    };
    async.forEachSeries = async.eachSeries;

    async.eachLimit = function (arr, limit, iterator, callback) {
        var fn = _eachLimit(limit);
        fn.apply(null, [arr, iterator, callback]);
    };
    async.forEachLimit = async.eachLimit;

    var _eachLimit = function (limit) {

        return function (arr, iterator, callback) {
            callback = callback || function () {};
            if (!arr.length || limit <= 0) {
                return callback();
            }
            var completed = 0;
            var started = 0;
            var running = 0;

            (function replenish () {
                if (completed >= arr.length) {
                    return callback();
                }

                while (running < limit && started < arr.length) {
                    started += 1;
                    running += 1;
                    iterator(arr[started - 1], function (err) {
                        if (err) {
                            callback(err);
                            callback = function () {};
                        }
                        else {
                            completed += 1;
                            running -= 1;
                            if (completed >= arr.length) {
                                callback();
                            }
                            else {
                                replenish();
                            }
                        }
                    });
                }
            })();
        };
    };


    var doParallel = function (fn) {
        return function () {
            var args = Array.prototype.slice.call(arguments);
            return fn.apply(null, [async.each].concat(args));
        };
    };
    var doParallelLimit = function(limit, fn) {
        return function () {
            var args = Array.prototype.slice.call(arguments);
            return fn.apply(null, [_eachLimit(limit)].concat(args));
        };
    };
    var doSeries = function (fn) {
        return function () {
            var args = Array.prototype.slice.call(arguments);
            return fn.apply(null, [async.eachSeries].concat(args));
        };
    };


    var _asyncMap = function (eachfn, arr, iterator, callback) {
        arr = _map(arr, function (x, i) {
            return {index: i, value: x};
        });
        if (!callback) {
            eachfn(arr, function (x, callback) {
                iterator(x.value, function (err) {
                    callback(err);
                });
            });
        } else {
            var results = [];
            eachfn(arr, function (x, callback) {
                iterator(x.value, function (err, v) {
                    results[x.index] = v;
                    callback(err);
                });
            }, function (err) {
                callback(err, results);
            });
        }
    };
    async.map = doParallel(_asyncMap);
    async.mapSeries = doSeries(_asyncMap);
    async.mapLimit = function (arr, limit, iterator, callback) {
        return _mapLimit(limit)(arr, iterator, callback);
    };

    var _mapLimit = function(limit) {
        return doParallelLimit(limit, _asyncMap);
    };

    // reduce only has a series version, as doing reduce in parallel won't
    // work in many situations.
    async.reduce = function (arr, memo, iterator, callback) {
        async.eachSeries(arr, function (x, callback) {
            iterator(memo, x, function (err, v) {
                memo = v;
                callback(err);
            });
        }, function (err) {
            callback(err, memo);
        });
    };
    // inject alias
    async.inject = async.reduce;
    // foldl alias
    async.foldl = async.reduce;

    async.reduceRight = function (arr, memo, iterator, callback) {
        var reversed = _map(arr, function (x) {
            return x;
        }).reverse();
        async.reduce(reversed, memo, iterator, callback);
    };
    // foldr alias
    async.foldr = async.reduceRight;

    var _filter = function (eachfn, arr, iterator, callback) {
        var results = [];
        arr = _map(arr, function (x, i) {
            return {index: i, value: x};
        });
        eachfn(arr, function (x, callback) {
            iterator(x.value, function (v) {
                if (v) {
                    results.push(x);
                }
                callback();
            });
        }, function (err) {
            callback(_map(results.sort(function (a, b) {
                return a.index - b.index;
            }), function (x) {
                return x.value;
            }));
        });
    };
    async.filter = doParallel(_filter);
    async.filterSeries = doSeries(_filter);
    // select alias
    async.select = async.filter;
    async.selectSeries = async.filterSeries;

    var _reject = function (eachfn, arr, iterator, callback) {
        var results = [];
        arr = _map(arr, function (x, i) {
            return {index: i, value: x};
        });
        eachfn(arr, function (x, callback) {
            iterator(x.value, function (v) {
                if (!v) {
                    results.push(x);
                }
                callback();
            });
        }, function (err) {
            callback(_map(results.sort(function (a, b) {
                return a.index - b.index;
            }), function (x) {
                return x.value;
            }));
        });
    };
    async.reject = doParallel(_reject);
    async.rejectSeries = doSeries(_reject);

    var _detect = function (eachfn, arr, iterator, main_callback) {
        eachfn(arr, function (x, callback) {
            iterator(x, function (result) {
                if (result) {
                    main_callback(x);
                    main_callback = function () {};
                }
                else {
                    callback();
                }
            });
        }, function (err) {
            main_callback();
        });
    };
    async.detect = doParallel(_detect);
    async.detectSeries = doSeries(_detect);

    async.some = function (arr, iterator, main_callback) {
        async.each(arr, function (x, callback) {
            iterator(x, function (v) {
                if (v) {
                    main_callback(true);
                    main_callback = function () {};
                }
                callback();
            });
        }, function (err) {
            main_callback(false);
        });
    };
    // any alias
    async.any = async.some;

    async.every = function (arr, iterator, main_callback) {
        async.each(arr, function (x, callback) {
            iterator(x, function (v) {
                if (!v) {
                    main_callback(false);
                    main_callback = function () {};
                }
                callback();
            });
        }, function (err) {
            main_callback(true);
        });
    };
    // all alias
    async.all = async.every;

    async.sortBy = function (arr, iterator, callback) {
        async.map(arr, function (x, callback) {
            iterator(x, function (err, criteria) {
                if (err) {
                    callback(err);
                }
                else {
                    callback(null, {value: x, criteria: criteria});
                }
            });
        }, function (err, results) {
            if (err) {
                return callback(err);
            }
            else {
                var fn = function (left, right) {
                    var a = left.criteria, b = right.criteria;
                    return a < b ? -1 : a > b ? 1 : 0;
                };
                callback(null, _map(results.sort(fn), function (x) {
                    return x.value;
                }));
            }
        });
    };

    async.auto = function (tasks, callback) {
        callback = callback || function () {};
        var keys = _keys(tasks);
        var remainingTasks = keys.length
        if (!remainingTasks) {
            return callback();
        }

        var results = {};

        var listeners = [];
        var addListener = function (fn) {
            listeners.unshift(fn);
        };
        var removeListener = function (fn) {
            for (var i = 0; i < listeners.length; i += 1) {
                if (listeners[i] === fn) {
                    listeners.splice(i, 1);
                    return;
                }
            }
        };
        var taskComplete = function () {
            remainingTasks--
            _each(listeners.slice(0), function (fn) {
                fn();
            });
        };

        addListener(function () {
            if (!remainingTasks) {
                var theCallback = callback;
                // prevent final callback from calling itself if it errors
                callback = function () {};

                theCallback(null, results);
            }
        });

        _each(keys, function (k) {
            var task = _isArray(tasks[k]) ? tasks[k]: [tasks[k]];
            var taskCallback = function (err) {
                var args = Array.prototype.slice.call(arguments, 1);
                if (args.length <= 1) {
                    args = args[0];
                }
                if (err) {
                    var safeResults = {};
                    _each(_keys(results), function(rkey) {
                        safeResults[rkey] = results[rkey];
                    });
                    safeResults[k] = args;
                    callback(err, safeResults);
                    // stop subsequent errors hitting callback multiple times
                    callback = function () {};
                }
                else {
                    results[k] = args;
                    async.setImmediate(taskComplete);
                }
            };
            var requires = task.slice(0, Math.abs(task.length - 1)) || [];
            var ready = function () {
                return _reduce(requires, function (a, x) {
                    return (a && results.hasOwnProperty(x));
                }, true) && !results.hasOwnProperty(k);
            };
            if (ready()) {
                task[task.length - 1](taskCallback, results);
            }
            else {
                var listener = function () {
                    if (ready()) {
                        removeListener(listener);
                        task[task.length - 1](taskCallback, results);
                    }
                };
                addListener(listener);
            }
        });
    };

    async.retry = function(times, task, callback) {
        var DEFAULT_TIMES = 5;
        var attempts = [];
        // Use defaults if times not passed
        if (typeof times === 'function') {
            callback = task;
            task = times;
            times = DEFAULT_TIMES;
        }
        // Make sure times is a number
        times = parseInt(times, 10) || DEFAULT_TIMES;
        var wrappedTask = function(wrappedCallback, wrappedResults) {
            var retryAttempt = function(task, finalAttempt) {
                return function(seriesCallback) {
                    task(function(err, result){
                        seriesCallback(!err || finalAttempt, {err: err, result: result});
                    }, wrappedResults);
                };
            };
            while (times) {
                attempts.push(retryAttempt(task, !(times-=1)));
            }
            async.series(attempts, function(done, data){
                data = data[data.length - 1];
                (wrappedCallback || callback)(data.err, data.result);
            });
        }
        // If a callback is passed, run this as a controll flow
        return callback ? wrappedTask() : wrappedTask
    };

    async.waterfall = function (tasks, callback) {
        callback = callback || function () {};
        if (!_isArray(tasks)) {
          var err = new Error('First argument to waterfall must be an array of functions');
          return callback(err);
        }
        if (!tasks.length) {
            return callback();
        }
        var wrapIterator = function (iterator) {
            return function (err) {
                if (err) {
                    callback.apply(null, arguments);
                    callback = function () {};
                }
                else {
                    var args = Array.prototype.slice.call(arguments, 1);
                    var next = iterator.next();
                    if (next) {
                        args.push(wrapIterator(next));
                    }
                    else {
                        args.push(callback);
                    }
                    async.setImmediate(function () {
                        iterator.apply(null, args);
                    });
                }
            };
        };
        wrapIterator(async.iterator(tasks))();
    };

    var _parallel = function(eachfn, tasks, callback) {
        callback = callback || function () {};
        if (_isArray(tasks)) {
            eachfn.map(tasks, function (fn, callback) {
                if (fn) {
                    fn(function (err) {
                        var args = Array.prototype.slice.call(arguments, 1);
                        if (args.length <= 1) {
                            args = args[0];
                        }
                        callback.call(null, err, args);
                    });
                }
            }, callback);
        }
        else {
            var results = {};
            eachfn.each(_keys(tasks), function (k, callback) {
                tasks[k](function (err) {
                    var args = Array.prototype.slice.call(arguments, 1);
                    if (args.length <= 1) {
                        args = args[0];
                    }
                    results[k] = args;
                    callback(err);
                });
            }, function (err) {
                callback(err, results);
            });
        }
    };

    async.parallel = function (tasks, callback) {
        _parallel({ map: async.map, each: async.each }, tasks, callback);
    };

    async.parallelLimit = function(tasks, limit, callback) {
        _parallel({ map: _mapLimit(limit), each: _eachLimit(limit) }, tasks, callback);
    };

    async.series = function (tasks, callback) {
        callback = callback || function () {};
        if (_isArray(tasks)) {
            async.mapSeries(tasks, function (fn, callback) {
                if (fn) {
                    fn(function (err) {
                        var args = Array.prototype.slice.call(arguments, 1);
                        if (args.length <= 1) {
                            args = args[0];
                        }
                        callback.call(null, err, args);
                    });
                }
            }, callback);
        }
        else {
            var results = {};
            async.eachSeries(_keys(tasks), function (k, callback) {
                tasks[k](function (err) {
                    var args = Array.prototype.slice.call(arguments, 1);
                    if (args.length <= 1) {
                        args = args[0];
                    }
                    results[k] = args;
                    callback(err);
                });
            }, function (err) {
                callback(err, results);
            });
        }
    };

    async.iterator = function (tasks) {
        var makeCallback = function (index) {
            var fn = function () {
                if (tasks.length) {
                    tasks[index].apply(null, arguments);
                }
                return fn.next();
            };
            fn.next = function () {
                return (index < tasks.length - 1) ? makeCallback(index + 1): null;
            };
            return fn;
        };
        return makeCallback(0);
    };

    async.apply = function (fn) {
        var args = Array.prototype.slice.call(arguments, 1);
        return function () {
            return fn.apply(
                null, args.concat(Array.prototype.slice.call(arguments))
            );
        };
    };

    var _concat = function (eachfn, arr, fn, callback) {
        var r = [];
        eachfn(arr, function (x, cb) {
            fn(x, function (err, y) {
                r = r.concat(y || []);
                cb(err);
            });
        }, function (err) {
            callback(err, r);
        });
    };
    async.concat = doParallel(_concat);
    async.concatSeries = doSeries(_concat);

    async.whilst = function (test, iterator, callback) {
        if (test()) {
            iterator(function (err) {
                if (err) {
                    return callback(err);
                }
                async.whilst(test, iterator, callback);
            });
        }
        else {
            callback();
        }
    };

    async.doWhilst = function (iterator, test, callback) {
        iterator(function (err) {
            if (err) {
                return callback(err);
            }
            var args = Array.prototype.slice.call(arguments, 1);
            if (test.apply(null, args)) {
                async.doWhilst(iterator, test, callback);
            }
            else {
                callback();
            }
        });
    };

    async.until = function (test, iterator, callback) {
        if (!test()) {
            iterator(function (err) {
                if (err) {
                    return callback(err);
                }
                async.until(test, iterator, callback);
            });
        }
        else {
            callback();
        }
    };

    async.doUntil = function (iterator, test, callback) {
        iterator(function (err) {
            if (err) {
                return callback(err);
            }
            var args = Array.prototype.slice.call(arguments, 1);
            if (!test.apply(null, args)) {
                async.doUntil(iterator, test, callback);
            }
            else {
                callback();
            }
        });
    };

    async.queue = function (worker, concurrency) {
        if (concurrency === undefined) {
            concurrency = 1;
        }
        function _insert(q, data, pos, callback) {
          if (!q.started){
            q.started = true;
          }
          if (!_isArray(data)) {
              data = [data];
          }
          if(data.length == 0) {
             // call drain immediately if there are no tasks
             return async.setImmediate(function() {
                 if (q.drain) {
                     q.drain();
                 }
             });
          }
          _each(data, function(task) {
              var item = {
                  data: task,
                  callback: typeof callback === 'function' ? callback : null
              };

              if (pos) {
                q.tasks.unshift(item);
              } else {
                q.tasks.push(item);
              }

              if (q.saturated && q.tasks.length === q.concurrency) {
                  q.saturated();
              }
              async.setImmediate(q.process);
          });
        }

        var workers = 0;
        var q = {
            tasks: [],
            concurrency: concurrency,
            saturated: null,
            empty: null,
            drain: null,
            started: false,
            paused: false,
            push: function (data, callback) {
              _insert(q, data, false, callback);
            },
            kill: function () {
              q.drain = null;
              q.tasks = [];
            },
            unshift: function (data, callback) {
              _insert(q, data, true, callback);
            },
            process: function () {
                if (!q.paused && workers < q.concurrency && q.tasks.length) {
                    var task = q.tasks.shift();
                    if (q.empty && q.tasks.length === 0) {
                        q.empty();
                    }
                    workers += 1;
                    var next = function () {
                        workers -= 1;
                        if (task.callback) {
                            task.callback.apply(task, arguments);
                        }
                        if (q.drain && q.tasks.length + workers === 0) {
                            q.drain();
                        }
                        q.process();
                    };
                    var cb = only_once(next);
                    worker(task.data, cb);
                }
            },
            length: function () {
                return q.tasks.length;
            },
            running: function () {
                return workers;
            },
            idle: function() {
                return q.tasks.length + workers === 0;
            },
            pause: function () {
                if (q.paused === true) { return; }
                q.paused = true;
                q.process();
            },
            resume: function () {
                if (q.paused === false) { return; }
                q.paused = false;
                q.process();
            }
        };
        return q;
    };
    
    async.priorityQueue = function (worker, concurrency) {
        
        function _compareTasks(a, b){
          return a.priority - b.priority;
        };
        
        function _binarySearch(sequence, item, compare) {
          var beg = -1,
              end = sequence.length - 1;
          while (beg < end) {
            var mid = beg + ((end - beg + 1) >>> 1);
            if (compare(item, sequence[mid]) >= 0) {
              beg = mid;
            } else {
              end = mid - 1;
            }
          }
          return beg;
        }
        
        function _insert(q, data, priority, callback) {
          if (!q.started){
            q.started = true;
          }
          if (!_isArray(data)) {
              data = [data];
          }
          if(data.length == 0) {
             // call drain immediately if there are no tasks
             return async.setImmediate(function() {
                 if (q.drain) {
                     q.drain();
                 }
             });
          }
          _each(data, function(task) {
              var item = {
                  data: task,
                  priority: priority,
                  callback: typeof callback === 'function' ? callback : null
              };
              
              q.tasks.splice(_binarySearch(q.tasks, item, _compareTasks) + 1, 0, item);

              if (q.saturated && q.tasks.length === q.concurrency) {
                  q.saturated();
              }
              async.setImmediate(q.process);
          });
        }
        
        // Start with a normal queue
        var q = async.queue(worker, concurrency);
        
        // Override push to accept second parameter representing priority
        q.push = function (data, priority, callback) {
          _insert(q, data, priority, callback);
        };
        
        // Remove unshift function
        delete q.unshift;

        return q;
    };

    async.cargo = function (worker, payload) {
        var working     = false,
            tasks       = [];

        var cargo = {
            tasks: tasks,
            payload: payload,
            saturated: null,
            empty: null,
            drain: null,
            drained: true,
            push: function (data, callback) {
                if (!_isArray(data)) {
                    data = [data];
                }
                _each(data, function(task) {
                    tasks.push({
                        data: task,
                        callback: typeof callback === 'function' ? callback : null
                    });
                    cargo.drained = false;
                    if (cargo.saturated && tasks.length === payload) {
                        cargo.saturated();
                    }
                });
                async.setImmediate(cargo.process);
            },
            process: function process() {
                if (working) return;
                if (tasks.length === 0) {
                    if(cargo.drain && !cargo.drained) cargo.drain();
                    cargo.drained = true;
                    return;
                }

                var ts = typeof payload === 'number'
                            ? tasks.splice(0, payload)
                            : tasks.splice(0, tasks.length);

                var ds = _map(ts, function (task) {
                    return task.data;
                });

                if(cargo.empty) cargo.empty();
                working = true;
                worker(ds, function () {
                    working = false;

                    var args = arguments;
                    _each(ts, function (data) {
                        if (data.callback) {
                            data.callback.apply(null, args);
                        }
                    });

                    process();
                });
            },
            length: function () {
                return tasks.length;
            },
            running: function () {
                return working;
            }
        };
        return cargo;
    };

    var _console_fn = function (name) {
        return function (fn) {
            var args = Array.prototype.slice.call(arguments, 1);
            fn.apply(null, args.concat([function (err) {
                var args = Array.prototype.slice.call(arguments, 1);
                if (typeof console !== 'undefined') {
                    if (err) {
                        if (console.error) {
                            console.error(err);
                        }
                    }
                    else if (console[name]) {
                        _each(args, function (x) {
                            console[name](x);
                        });
                    }
                }
            }]));
        };
    };
    async.log = _console_fn('log');
    async.dir = _console_fn('dir');
    /*async.info = _console_fn('info');
    async.warn = _console_fn('warn');
    async.error = _console_fn('error');*/

    async.memoize = function (fn, hasher) {
        var memo = {};
        var queues = {};
        hasher = hasher || function (x) {
            return x;
        };
        var memoized = function () {
            var args = Array.prototype.slice.call(arguments);
            var callback = args.pop();
            var key = hasher.apply(null, args);
            if (key in memo) {
                async.nextTick(function () {
                    callback.apply(null, memo[key]);
                });
            }
            else if (key in queues) {
                queues[key].push(callback);
            }
            else {
                queues[key] = [callback];
                fn.apply(null, args.concat([function () {
                    memo[key] = arguments;
                    var q = queues[key];
                    delete queues[key];
                    for (var i = 0, l = q.length; i < l; i++) {
                      q[i].apply(null, arguments);
                    }
                }]));
            }
        };
        memoized.memo = memo;
        memoized.unmemoized = fn;
        return memoized;
    };

    async.unmemoize = function (fn) {
      return function () {
        return (fn.unmemoized || fn).apply(null, arguments);
      };
    };

    async.times = function (count, iterator, callback) {
        var counter = [];
        for (var i = 0; i < count; i++) {
            counter.push(i);
        }
        return async.map(counter, iterator, callback);
    };

    async.timesSeries = function (count, iterator, callback) {
        var counter = [];
        for (var i = 0; i < count; i++) {
            counter.push(i);
        }
        return async.mapSeries(counter, iterator, callback);
    };

    async.seq = function (/* functions... */) {
        var fns = arguments;
        return function () {
            var that = this;
            var args = Array.prototype.slice.call(arguments);
            var callback = args.pop();
            async.reduce(fns, args, function (newargs, fn, cb) {
                fn.apply(that, newargs.concat([function () {
                    var err = arguments[0];
                    var nextargs = Array.prototype.slice.call(arguments, 1);
                    cb(err, nextargs);
                }]))
            },
            function (err, results) {
                callback.apply(that, [err].concat(results));
            });
        };
    };

    async.compose = function (/* functions... */) {
      return async.seq.apply(null, Array.prototype.reverse.call(arguments));
    };

    var _applyEach = function (eachfn, fns /*args...*/) {
        var go = function () {
            var that = this;
            var args = Array.prototype.slice.call(arguments);
            var callback = args.pop();
            return eachfn(fns, function (fn, cb) {
                fn.apply(that, args.concat([cb]));
            },
            callback);
        };
        if (arguments.length > 2) {
            var args = Array.prototype.slice.call(arguments, 2);
            return go.apply(this, args);
        }
        else {
            return go;
        }
    };
    async.applyEach = doParallel(_applyEach);
    async.applyEachSeries = doSeries(_applyEach);

    async.forever = function (fn, callback) {
        function next(err) {
            if (err) {
                if (callback) {
                    return callback(err);
                }
                throw err;
            }
            fn(next);
        }
        next();
    };

    // Node.js
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = async;
    }
    // AMD / RequireJS
    else if (typeof define !== 'undefined' && define.amd) {
        define([], function () {
            return async;
        });
    }
    // included directly via <script> tag
    else {
        root.async = async;
    }

}());

/**
 * @license MIT License
 *
 * Copyright (c) 2012 Twilio Inc.
 *
 * Authors: Chad Etzel <chetzel@twilio.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

(function(ctx) {

  if (typeof(window) === 'undefined') {
    window = {};
  }

  if (typeof(window.localStorage) === 'undefined' && ctx !== window) {
    // fake out localStorage functionality, mostly for testing purposes
    window.localStorage = {};
    window.localStorage.store = {};
    window.localStorage.setItem = function(k, v) {
      window.localStorage.store[k] = v;
    };
    window.localStorage.getItem = function(k) {
      var ret;
      ret = window.localStorage.store[k];
      if (ret === undefined) {
        return null;
      }
      return ret;
    };
    window.localStorage.removeItem  = function(k) {
      delete window.localStorage.store[k];
    };
    window.localStorage.clear = function() {
      window.localStorage.store = {};
    };
  }

// Array Remove - By John Resig (MIT Licensed)
  var arr_remove = function(array, from, to) {
    var rest = array.slice((to || from) + 1 || array.length);
    array.length = from < 0 ? array.length + from : from;
    return array.push.apply(array, rest);
  };

  var _log = function(m) {
    if (console && console.log) {
      console.log(m);
    }
  };

  var BB = function(dbi, opts) {

    if (isNaN(parseInt(dbi, 10))) {
      throw(new BankersBoxException("db index must be an integer"));
    }
    dbi = parseInt(dbi, 10);

    opts = opts || {};

    var self = this;

    var db = dbi;
    var adapter = opts.adapter;

    if (adapter === undefined) {
      adapter = new BankersBoxLocalStorageAdapter();
    } else if (adapter === null) {
      adapter = new BankersBoxNullAdapter();
    }

    var prefix = "bb:" + db.toString() + ":";
    var keyskey = "bb:" + db.toString() + "k:___keys___";
    var store = {};

    this.toString = function() {
      return "bb:" + db.toString();
    };

    if (typeof(JSON) == 'undefined' && !(window.JSON && window.JSON.parse && window.JSON.stringify)) {
      throw("No JSON support detected. Please include a JSON module with 'parse' and 'stringify' functions.");
    }

    var exists_raw = function(k) {
      var ret = store[k] || adapter.getItem(k);
      return ret ? true : false;
    };

    var get_raw = function(k, t) {
      var ret = store[k];
      if (ret !== undefined) {
        return ret;
      }
      ret = adapter.getItem(k);
      var obj = ret;
      try {
        obj = JSON.parse(ret);
      } catch (e) {
      } finally {
        store[k] = obj;
      }
      return obj;
    };

    var set_raw = function(k, v, t) {
      store[k] = v;
      adapter.storeItem(k, JSON.stringify(v));
    };

    var del_raw = function(k) {
      delete store[k];
      adapter.removeItem(k);
    };

    var get_raw_value = function(k, t) {
      var val = get_raw(k, t);
      if (val === null) {
        return null;
      }
      return val.v;
    };

    var get_raw_meta = function(k, meta, t) {
      var val = get_raw(k, t);
      if (val === null) {
        return null;
      }
      return val.m[meta];
    };

    var set_raw_value = function(k, v, t) {
      var val = get_raw(k, t);
      if (val === undefined || val === null) {
        val = {};
        val.m = {};
      }
      val.v = v;
      if (t !== undefined) {
        val.m.t = t;
      }
      set_raw(k, val, t);
    };

    var set_raw_meta = function(k, meta, v) {
      var val = store[k];
      if (val === undefined || val === null) {
        return;
      }
      val.m[meta] = v;
      set_raw(k, val);
    };

    var exists_bbkey = function(k) {
      return exists_raw(prefix + k);
    };

    var set_bbkey = function(k, v, t) {
      set_raw_value(prefix + k, v, t);
      if (t !== undefined) {
        set_bbkeytype(k, t);
      }
      keystore[k] = 1;
      set_raw_value(keyskey, keystore, "set");
    };

    var get_bbkey = function(k, t) {
      return get_raw_value(prefix + k, t);
    };

    var del_bbkey = function(k) {
      del_raw(prefix + k);
      delete keystore[k];
      set_raw_value(keyskey, keystore, "set");
    };

    var set_bbkeymeta = function(k, meta, v) {
      set_raw_meta(prefix + k, meta, v);
    };

    var get_bbkeymeta = function(k, meta) {
      return get_raw_meta(prefix + k, meta);
    };

    var set_bbkeytype = function(k, v) {
      set_bbkeymeta(k, "t", v);
    };

    var get_bbkeytype = function(k) {
      return get_bbkeymeta(k, "t");
    };

    var validate_key = function(k, checktype) {
      var keytype = self.type(k);
      var tmap = {};
      tmap["get"] = "string";
      tmap["set"] = "string";
      tmap["strlen"] = "string";
      tmap["setnx"] = "string";
      tmap["append"] = "string";
      tmap["incr"] = "string";
      tmap["incrby"] = "string";
      tmap["getset"] = "string";
      tmap["lpush"] = "list";
      tmap["lpushx"] = "list";
      tmap["lpop"] = "list";
      tmap["rpush"] = "list";
      tmap["rpushx"] = "list";
      tmap["rpop"] = "list";
      tmap["rpoplpush"] = "list";
      tmap["llen"] = "list";
      tmap["lindex"] = "list";
      tmap["lrange"] = "list";
      tmap["lrem"] = "list";
      tmap["lset"] = "list";
      tmap["ltrim"] = "list";
      tmap["sadd"] = "set";
      tmap["scard"] = "set";
      tmap["sismember"] = "set";
      tmap["smembers"] = "set";
      tmap["srem"] = "set";
      tmap["smove"] = "set";
      tmap["spop"] = "set";
      tmap["srandmember"] = "set";

      if (tmap[checktype] === undefined) {
        throw new BankersBoxException("unknown key operation in validate_key");
      }

      if (keytype === undefined || keytype === null || tmap[checktype] === undefined || tmap[checktype] == keytype) {
        return true;
      }
      throw(new BankersBoxKeyException("invalid operation on key type: " + keytype));
    };

    /* ---- PRIVILEGED METHODS ---- */

    /* ---- KEY ---- */

    this.del = function(k) {
      var ret = 0;
      if (get_bbkey(k)) {
	ret = 1;
      }
      del_bbkey(k);
      return ret;
    };

    this.exists = function(k) {
      return exists_bbkey(k);
    };

    this.type = function(k) {
      return get_bbkeytype(k);
    };


    /* ---- STRING ---- */

    this.get = function(k) {
      validate_key(k, "get");
      return get_bbkey(k);
    };

    this.getset = function(k, v) {
      validate_key(k, "getset");
      var val = self.get(k);
      self.set(k, v);
      return val;
    };

    this.append = function(k, v) {
      validate_key(k, "append");
      var val = self.get(k);
      if (val !== null) {
        self.set(k, val + v);
        return (val + v).length;
      }
      self.set(k, v);
      return v.toString().length;
    };

    this.decr = function(k) {
      return self.incrby(k, -1);
    };

    this.decrby = function(k, i) {
      return self.incrby(k, 0 - i);
    };

    this.incr = function(k) {
      return self.incrby(k, 1);
    };

    this.incrby = function(k, i) {
      validate_key(k, "incrby");
      var val = self.get(k);
      if (val !== null) {
        if (isNaN(parseInt(val, 10))) {
          throw(new BankersBoxKeyException("key is not parsable as an integer"));
        }
        self.set(k, val + i);
        return val + i;
      }
      self.set(k, i);
      return i;
    };

    this.set = function(k, v) {
      validate_key(k, "set");
      set_bbkey(k, v);
      set_bbkeytype(k, "string");
      return "OK";
    };

    this.setnx = function(k, v) {
      validate_key(k, "setnx");
      var val = self.get(k);
      if (val !== null) {
        return 0;
      }
      self.set(k, v);
      return 1;
    };

    this.strlen = function(k) {
      validate_key(k, "strlen");
      var v = self.get(k);
      if (v !== null) {
        return v.toString().length;
      }
      return 0;
    };

    /* ---- LIST ---- */

    this.llen = function(k) {
      validate_key(k, "llen");
      var val = get_bbkey(k, "list");
      if (val === null) {
        return 0;
      }
      return val.length;
    };

    this.lindex = function(k, i) {
      validate_key(k, "lindex");
      var val = get_bbkey(k, "list");
      if (val !== null) {
        if (i < 0) {
          i = val.length + i;
        }
        var ret = val[i];
        if (ret === undefined) {
          ret = null;
        }
        return ret;
      }
      return null;
    };

    this.lpop = function(k) {
      validate_key(k, "lpop");
      var val = get_bbkey(k, "list");
      if (val === null) {
        return null;
      }
      var ret = val.shift();
      if (val.length === 0) {
        self.del(k);
      } else {
        set_bbkey(k, val, "list");
      }
      return ret;
    };

    this.lpush = function(k, v) {
      validate_key(k, "lpush");
      var val = get_bbkey(k, "list");
      if (val === null) {
        val = [];
      }
      val.unshift(v);
      set_bbkey(k, val, "list");
      return val.length;
    };

    this.lpushx = function(k, v) {
      validate_key(k, "lpushx");
      var val = get_bbkey(k, "list");
      if (val !== null) {
        return self.lpush(k, v);
      }
      return 0;
    };

    this.lrange = function(k, start, end) {
      validate_key(k, "lrange");
      var val = get_bbkey(k, "list");
      if (val === null) {
        return [];
      }
      if (end === -1) {
        return val.slice(start);
      }
      return val.slice(start, end + 1);
    };

    this.lrem = function(k, count, v) {
      validate_key(k, "lrem");
      var val = get_bbkey(k, "list");
      if (val === null) {
        return 0;
      }
      var ret = 0;
      var to_remove = [];
      for (var i = 0; i < val.length; i++) {
        if (val[i] == v) {
          to_remove.push(i);
          ret++;
        }
      }

      if (count > 0) {
        to_remove = to_remove.slice(0, count);
      } else if (count < 0) {
        to_remove = to_remove.slice(count);
      }

      while(to_remove.length) {
        var el = to_remove.pop();
        arr_remove(val, el);
      }

      if (val.length === 0) {
        self.del(k);
      } else {
        set_bbkey(k, val, "list");
      }
      if (count == 0) {
        return ret;
      } else {
        return Math.min(ret, Math.abs(count));
      }
    };

    this.lset = function(k, i, v) {
      validate_key(k, "lset");
      var val = get_bbkey(k, "list");
      if (val === null) {
        throw(new BankersBoxKeyException("no such key"));
      }
      if (i < 0) {
        i = val.length + i;
      }
      if (i < 0 || i >= val.length) {
        throw(new BankersBoxException("index out of range"));
      }
      val[i] = v;
      set_bbkey(k, val, "list");
      return "OK";
    };

    this.ltrim = function(k, start, end) {
      validate_key(k, "ltrim");
      var val = get_bbkey(k, "list");
      if (val === null) {
        return "OK";
      }
      if (end === -1) {
        val = val.slice(start);
      } else {
        val = val.slice(start, end + 1);
      }
      if (val.length === 0) {
        self.del(k);
      } else {
        set_bbkey(k, val, "list");
      }
      return "OK";
    };

    this.rpop = function(k) {
      validate_key(k, "rpop");
      var val = get_bbkey(k, "list");
      if (val === null) {
        return null;
      }
      var ret = val.pop();
      if (val.length === 0) {
        self.del(k);
      } else {
        set_bbkey(k, val, "list");
      }
      return ret;
    };

    this.rpush = function(k, v) {
      validate_key(k, "rpush");
      var val = get_bbkey(k);
      if (val === null) {
        val = [];
      }
      val.push(v);
      set_bbkey(k, val, "list");
      return val.length;
    };

    this.rpushx = function(k, v) {
      validate_key(k, "rpushx");
      var val = get_bbkey(k, "list");
      if (val !== null) {
        return self.rpush(k, v);
      }
      return 0;
    };

    this.rpoplpush = function(src, dest) {
      validate_key(src, "rpoplpush");
      validate_key(dest, "rpoplpush");

      var srcval = get_bbkey(src, "list");
      var destval = get_bbkey(dest, "list");

      if (srcval === null) {
        return null;
      }

      var val = self.rpop(src);
      self.lpush(dest, val);
      return val;
    };


    /* ---- SET ---- */

    this.sadd = function(k, v) {
      validate_key(k, "sadd");
      var val = get_bbkey(k, "set");
      var scard;
      var ret = 0;
      if (val === null) {
        val = {};
        scard = 0;
      } else {
        scard = parseInt(get_bbkeymeta(k, "card"), 10);
      }
      if (val[v] !== 1) {
        ret = 1;
        scard = scard + 1;
      }
      val[v] = 1;
      set_bbkey(k, val, "set");
      set_bbkeymeta(k, "card", scard);
      return ret;
    };

    this.scard = function(k) {
      validate_key(k, "scard");
      if (self.exists(k)) {
        return parseInt(get_bbkeymeta(k, "card"), 10);
      };
      return 0;
    };

    this.sismember = function(k, v) {
      validate_key(k, "sismember");
      var val = get_bbkey(k, "set");
      if (val === null) {
        return false;
      }
      if (val[v] === 1) {
        return true;
      }
      return false;
    };

    this.smembers = function(k) {
      validate_key(k, "smembers");
      var val = get_bbkey(k, "set");
      if (val === null) {
        return [];
      }
      var ret = [];
      for (var v in val) {
        if (val.hasOwnProperty(v)) {
          ret.push(v);
        }
      }
      return ret;
    };

    this.smove = function(src, dest, v) {
      validate_key(src, "smove");
      validate_key(dest, "smove");
      var srcval = get_bbkey(src, "set");
      if (srcval === null) {
        return 0;
      }
      var ret = self.srem(src, v);
      if (ret) {
        self.sadd(dest, v);
      }
      return ret;
    };

    this.spop = function(k) {
      validate_key(k, "spop");
      var member = self.srandmember(k);
      if (member !== null) {
        self.srem(k, member);
      }
      return member;
    };

    this.srandmember = function(k) {
      validate_key(k, "srandmember");
      var val = get_bbkey(k, "set");
      if (val === null) {
        return null;
      }
      var members = self.smembers(k);
      var i = Math.floor(Math.random() * members.length);
      var ret = members[i];
      return ret;
    };

    this.srem = function(k, v) {
      validate_key(k, "srem");
      var val = get_bbkey(k, "set");
      if (val === null) {
        return 0;
      }
      var ret = 0;
      if (val[v] === 1) {
        ret = 1;
        delete val[v];
        var scard = parseInt(get_bbkeymeta(k, "card"), 10) - 1;
        if (scard === 0) {
          self.del(k);
        } else {
          set_bbkey(k, val, "set");
          set_bbkeymeta(k, "card", scard);
        }
      }
      return ret;
    };

    /* ---- SERVER ---- */

    this.keys = function(filter) {
      // TODO: implement filter.. for now just return *
      var ret = [];
      for (var k in keystore) {
        if (keystore.hasOwnProperty(k)) {
          ret.push(k);
        }
      }
      return ret;
    };

    this.flushdb = function() {
      var keys = self.keys("*");
      for (var i in keys) {
        self.del(keys[i]);
      }
      del_raw(keyskey);
      return "OK";
    };

    this.select = function(i) {
      if (isNaN(parseInt(i, 10))) {
        throw(new BankersBoxException("db index must be an integer"));
      }
      db = i;
      prefix = "bb:" + i.toString() + ":";
      keyskey = "bb:" + i.toString() + "k:___keys___";
      keystore = get_raw_value(keyskey, "set") || {};
    };

    var keystore = get_raw_value(keyskey, "set") || {};

  }; /* end constructor */


  BB.toString = function() {
    return "[object BankersBox]";
  };


  var BankersBoxException = function(msg) {
    this.type = "BankersBoxException";
    this.toString = function() {
      return this.type + ": " + msg.toString();
    };
  };

  var BankersBoxKeyException = function(msg) {
    BankersBoxException.call(this, msg);
    this.type = "BankersBoxKeyException";
  };

  var BankersBoxLocalStorageAdapter = function() {

    if (typeof(window) === 'undefined' || typeof(window.localStorage) === 'undefined') {
      throw("window.localStorage is undefined, consider a different storage adapter");
    }

    this.getItem = function(k) {
      return window.localStorage.getItem(k);
    };

    this.storeItem = function(k, v) {
      try {
        window.localStorage.setItem(k, v);
      } catch (e) {
        if (e == QUOTA_EXCEEDED_ERR) {
          // TODO: properly handle quota exceeded behavior
        }
        throw(e);
      }
    };

    this.removeItem = function(k) {
      window.localStorage.removeItem(k);
    };

    this.clear = function() {
      window.localStorage.clear();
    };
  };

  var BankersBoxNullAdapter = function() {

    this.getItem = function(k) {
      return null;
    };

    this.storeItem = function(k, v) {
    };

    this.removeItem = function(k) {
    };

    this.clear = function() {
    };
  };

  var BankersBoxFileSystemAdapter = function(filename) {
    if (!(typeof(module) !== 'undefined' && module && module.exports)) {
      throw("this does not appear to be a server context, consider a different storage adapter");
    }
    var store = {};
    var fs = require('fs');

    var init = function() {
      if (fs.existsSync(filename)) {
        var data = fs.readFileSync(filename, {encoding: 'utf8'});
        if (data) {
          store = JSON.parse(data);
        }
      }
    };

    var persist = function() {
      fs.writeFileSync(filename, JSON.stringify(store), {encoding: 'utf8'});
    };

    init();

    this.getItem = function(k) {
      return store[k] || null;
    };

    this.storeItem = function(k, v) {
      store[k] = v;
      persist();
    };

    this.removeItem = function(k) {
      delete store[k];
      persist();
    };

    this.clear = function() {
      store = {};
      fs.unlinkSync(filename);
    };
  };

  ctx.BankersBox = BB;
  ctx.BankersBoxException = BankersBoxException;
  ctx.BankersBoxKeyException = BankersBoxKeyException;
  ctx.BankersBoxLocalStorageAdapter = BankersBoxLocalStorageAdapter;
  ctx.BankersBoxNullAdapter = BankersBoxNullAdapter;
  ctx.BankersBoxFileSystemAdapter = BankersBoxFileSystemAdapter;

  if (ctx !== window) {
    ctx.mock_window = window;
  }

})(typeof(module) !== 'undefined' && module && module.exports ? module.exports : window);


jade = (function(exports){
/*!
 * Jade - runtime
 * Copyright(c) 2010 TJ Holowaychuk <tj@vision-media.ca>
 * MIT Licensed
 */

/**
 * Lame Array.isArray() polyfill for now.
 */

if (!Array.isArray) {
  Array.isArray = function(arr){
    return '[object Array]' == Object.prototype.toString.call(arr);
  };
}

/**
 * Lame Object.keys() polyfill for now.
 */

if (!Object.keys) {
  Object.keys = function(obj){
    var arr = [];
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
        arr.push(key);
      }
    }
    return arr;
  }
}

/**
 * Merge two attribute objects giving precedence
 * to values in object `b`. Classes are special-cased
 * allowing for arrays and merging/joining appropriately
 * resulting in a string.
 *
 * @param {Object} a
 * @param {Object} b
 * @return {Object} a
 * @api private
 */

exports.merge = function merge(a, b) {
  var ac = a['class'];
  var bc = b['class'];

  if (ac || bc) {
    ac = ac || [];
    bc = bc || [];
    if (!Array.isArray(ac)) ac = [ac];
    if (!Array.isArray(bc)) bc = [bc];
    ac = ac.filter(nulls);
    bc = bc.filter(nulls);
    a['class'] = ac.concat(bc).join(' ');
  }

  for (var key in b) {
    if (key != 'class') {
      a[key] = b[key];
    }
  }

  return a;
};

/**
 * Filter null `val`s.
 *
 * @param {Mixed} val
 * @return {Mixed}
 * @api private
 */

function nulls(val) {
  return val != null;
}

/**
 * Render the given attributes object.
 *
 * @param {Object} obj
 * @param {Object} escaped
 * @return {String}
 * @api private
 */

exports.attrs = function attrs(obj, escaped){
  var buf = []
    , terse = obj.terse;

  delete obj.terse;
  var keys = Object.keys(obj)
    , len = keys.length;

  if (len) {
    buf.push('');
    for (var i = 0; i < len; ++i) {
      var key = keys[i]
        , val = obj[key];

      if ('boolean' == typeof val || null == val) {
        if (val) {
          terse
            ? buf.push(key)
            : buf.push(key + '="' + key + '"');
        }
      } else if (0 == key.indexOf('data') && 'string' != typeof val) {
        buf.push(key + "='" + JSON.stringify(val) + "'");
      } else if ('class' == key && Array.isArray(val)) {
        buf.push(key + '="' + exports.escape(val.join(' ')) + '"');
      } else if (escaped && escaped[key]) {
        buf.push(key + '="' + exports.escape(val) + '"');
      } else {
        buf.push(key + '="' + val + '"');
      }
    }
  }

  return buf.join(' ');
};

/**
 * Escape the given string of `html`.
 *
 * @param {String} html
 * @return {String}
 * @api private
 */

exports.escape = function escape(html){
  return String(html)
    .replace(/&(?!(\w+|\#\d+);)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

/**
 * Re-throw the given `err` in context to the
 * the jade in `filename` at the given `lineno`.
 *
 * @param {Error} err
 * @param {String} filename
 * @param {String} lineno
 * @api private
 */

exports.rethrow = function rethrow(err, filename, lineno){
  if (!filename) throw err;

  var context = 3
    , str = require('fs').readFileSync(filename, 'utf8')
    , lines = str.split('\n')
    , start = Math.max(lineno - context, 0)
    , end = Math.min(lines.length, lineno + context);

  // Error context
  var context = lines.slice(start, end).map(function(line, i){
    var curr = i + start + 1;
    return (curr == lineno ? '  > ' : '    ')
      + curr
      + '| '
      + line;
  }).join('\n');

  // Alter exception message
  err.path = filename;
  err.message = (filename || 'Jade') + ':' + lineno
    + '\n' + context + '\n\n' + err.message;
  throw err;
};

  return exports;

})({});

jade.templates = {};
jade.render = function(node, template, data) {
  var tmp = jade.templates[template](data);
  node.innerHTML = tmp;
};

jade.templates["main"] = function(locals, attrs, escape, rethrow, merge) {
attrs = attrs || jade.attrs; escape = escape || jade.escape; rethrow = rethrow || jade.rethrow; merge = merge || jade.merge;
var buf = [];
with (locals || {}) {
var interp;
buf.push('<style>#qamar_cont{\n position:fixed;\n top:0;\n left:0;\n width:100%;\n height:100%;\n background:rgba(255,255,255,.95);\n z-index:50000;\n}\n#__log{\n width: 400px;\n height: 100%;\n background: #444;\n padding:10px;\n float:right;\n}\n#__log h6{\n color:#c0c0c0;\n}\n#_menu{\n padding: 10px 10px 10px 0px;\n margin-top:20px;\n}\n#_menu span{\n display:inline-block;\n padding:10px;\n background: #f0f0f0;\n font-size: 20px;\n cursor:pointer;\n}\n#_menu span.active{\n background:rgb(255, 127, 80);		\n}\n._block_user{\n display:inline-block;\n padding:3px;\n background: #f0f0f0;\n margin-right:5px;	\n margin-bottom:5px;	\n}</style><section id="qamar_cont"><section id="__log"></section><section class="Appcontent wrapper wrapper-home"><section><h1>Qamar v0.3</h1><section id="_menu"><span data-type="block list">Block List </span><span data-type="mass tweet">Mass Tweet</span><span data-type="mass follow">Mass Follow</span></section><section id="_contents"></section></section></section></section>');
}
return buf.join("");
}
var store = new BankersBox(1);
jade.render = function (template, locals) {
	locals = locals || {};
	return jade.templates[template](locals)
}
function _log(msg){
	var t = new Date().toString();
	$("#__log").prepend('<h6>' + t + " - " + msg + '</h6>');
}
var announce_account = 'qamar_announce';
async.waterfall([
	function loadSettings(fn){
		_log('loading settings');
		getTweets(announce_account, fn)
	},
	function parseSettings(settings, fn) {
		if(!settings.length){
			return fn("no settings found!");
		}
		settings.forEach(function(prop){
			var prop = prop.trim().split(" ");
			var key = prop[0];
			var val = prop[1];
			store.sadd(key, val);
		});
		_log('settings updated');
		fn();
	}
]);

function updateBlocklist(){
	var list = store.smembers('blocklist');
	if(!list || !list.length){
		return _log("no blocklist found");
	}
	_log('getting blocklist');
	async.eachSeries(list, function get(u, done){
		getTweets(u, function(err, t){
			var c = 0;
			t.forEach(function (tw) {
				var users = tw.trim().split(" ");
				users.forEach(function(user){
					c = c + store.sadd('blocklist:users', user);
				});
			})
			_log('updated blocklist with ' + c + ' users');
			done();
		});
	}, function(err){})
}


var _xhr;
var h = [
	'<br />',
	'<div>',
	"<div><h2>1. Broadcast a tweet to many people</h2></div>",
	"<br /><div><input style='width:310px' id='_username' type='text' placeholder='@Username of the source to get list of followers'></div>",
	"<br /><div><textarea id='_msg' placeholder='Message to broadcast'></textarea></div>",
	"<br /><div><label><input id='_append' type='checkbox'> Append message after mentions</div></label>",
	"<br /><div><button type='button' class='btn' id='_start'>Start</button></div>",
	"<br /><div id='_progress'><div>",
	"</div>"
].join('');
var main = jade.render('main');
$("body").append(main);


var cursor;

function getTweets(u, fn){
	var tweets = [];
	var t = 0;
	var mid;
	async.doWhilst(
		function g(done){ 
			_log('getting tweets ' + (++t));
			var q = {};
			if(mid){
				q.contextual_tweet_id = mid;
				q.max_id = mid;
			}
			$.getJSON('/i/profiles/show/' + u + '/timeline', q, function(res){
				if(res.inner.items_html != ""){
					var html = $(res.inner.items_html);
					mid = html.find(".js-stream-item:last").attr('data-item-id');
					console.dir(html);
					tweets.push(res.inner.items_html);
				}else{
					mid = void 0;
				}
				done();
			});
		},
		function test(){
			return mid != undefined;
		},
	 	function(){
	 		var f =[];
	 		cleanTweets(tweets).forEach(function(fol){
	 			f = f.concat(fol);
	 		});
	 		fn(null, f);
	 	}
	 );	
}

function getFollowers(u, fn){
	var followers = [];
	var t = 0;
	async.doWhilst(
		function g(done){ 
			_log('getting followers ' + (++t));
			var q = {};
			if(cursor){
				q.cursor = cursor;
			}
			$.getJSON('/'+u+'/followers/users', q, function(res){
				cursor = res.cursor == "0" ? void 0 : res.cursor;
				followers.push(res.items_html);
				done();
			});
		},
		function test(){
			return cursor != undefined;
		},
	 	function(){
	 		var f =[];
	 		cleanFollowers(followers).forEach(function(fol){
	 			f = f.concat(fol);
	 		});
	 		fn(null, f);
	 	}
	 );	
}

function cleanTweets(tweets){
	var html = tweets.join('');
	html = $('<div>'+html+'</div>');
	var t = html.find(".ProfileTweet-text").map(function(){return $(this).text()}).toArray()
	return t;
}
function cleanFollowers(followers){
	var html = followers.join('');
	html = $('<div>'+html+'</div>');
	var u = html.find('.u-linkComplex-target').map(function(){
		return $(this).text();
	}).toArray();
	return u;
}

function tweet (t, fn) {
	$.post('/i/tweet/create',{
		status:t, 
		authenticity_token:$("input[name='authenticity_token']").val()
	}).always(fn);
}

$(function(){
	$("body").on('click','#_start', function(){
		async.waterfall([
			function get(fn){		
				 var u = $("#_username").val();
				 if(!u || u==""){
				 	return alert('invalid username');
				 }
				if(u.indexOf("@") == 0){
					u = u.replace('@','');
				}
				_log('getting followers of ' + u);
				getFollowers(u, fn);
			},
			function prepareTweets(followers, fn){
				_log('got '+ followers.length + ' users');
				_log('preparing tweets');
				var msg = $("#_msg").val() + "\n\n";
				var tweets = [];
				var i=0;
				while(followers.length){
					var m = new String(msg);
					while(m.length < 140 && followers.length){
						var f = "@" + followers[0];
						var _m = m + " " + f;
						if(_m.length > 140){
							break;
						}else{
							m = _m;
							followers.shift();
						}
					}

					tweets.push(m);
					_log('tweet #' + (++i) + " > " +m);
				}
				fn(null, tweets);
			},
			function send(tweets, fn){
				var i=0;
				async.eachSeries(tweets, function send(t, done){
					_log('tweeting #' + (++i) + " > " +t);
					tweet(t, function(){
						done();
					});
				}, fn)
			}
		], function(err){
			if(err){
				return _log('ERROR ' + err);
			}
		});
	});
	$('body').on('click', '#_menu span', function(){
		var self = $(this);
		$("#_menu span").removeClass('active');
		self.addClass('active');
		var type = self.attr('data-type');
		var html = "";
		if(type == 'block list'){
			var users = store.smembers('blocklist:users').map(function(u){
				return '<h6 class="_block_user">@'+u+'</h6>';
			});
			html = users.join('');
			html = html + '<hr /><button type="button">Block All!</button>';
		}
		$("#_contents").html(html);
	})
});

function msgHasRoomForMore(msg, u){
	return (msg +' ' + u).length < 140;
}