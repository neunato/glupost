"use strict"

let assert = require("assert")
let fs = require("fs-extra")
let gulp = require("gulp")
let glupost = require(".")
let async_done = require("async-done")
let Vinyl = require("vinyl")

let assert_equal = assert.strictEqual
let assert_throws = assert.throws


// TODO
// - add template tests

let tests = {
   "function (sync)": {
      init: (state) => ({
         "main": () => {
            state.x = true
         }
      }),
      test: ({x}) => assert_equal(x, true)
   },

   "function (async callback)": {
      init: (state) => ({
         "main": (done) => {
            state.x = true
            setTimeout(done, 75)
         }
      }),
      test: ({x}) => assert_equal(x, true)
   },

   "function (async promise)": {
      init: (state) => ({
         "main": async () => {
            await sleep(75)
            state.x = true
         }
      }),
      test: ({x}) => assert_equal(x, true)
   },

   "alias": {
      init: (state) => ({
         "main": "mane",
         "mane": () => {
            state.x = true
         }
      }),
      test: ({x}) => assert_equal(x, true)
   },

   "aliased alias": {
      init: (state) => ({
         "main": "mane",
         "mane": "maine",
         "maine": () => {
            state.x = true
         }
      }),
      test: ({x}) => assert_equal(x, true)
   },

   "object (vinyl src)": {
      init: (state) => ({
         "main": {
            src: new Vinyl({
               path: "birds/owls.txt",
               contents: Buffer.from("maybe")
            })
         }
      }),
      test: () => assert_equal(read("birds/owls.txt"), "maybe")
   },

   "object (rename)": {
      init: (state) => ({
         "main": {
            src: "birds/owls.txt",
            rename: "birds/owls-do.txt"
         }
      }),
      test: () => assert_equal(read("birds/owls.txt"), read("birds/owls-do.txt"))
   },

   "object (dest)": {
      init: (state) => ({
         "main": {
            src: "birds/owls.txt",
            dest: "birds/prey/"
         }
      }),
      test: () => assert_equal(read("birds/owls.txt"), read("birds/prey/owls.txt"))
   },

   "object (base)": {
      init: (state) => ({
         "main": {
            src: "birds/owls.txt",
            base: "",
            dest: "birds/prey/"
         }
      }),
      test: () => assert_equal(read("birds/owls.txt"), read("birds/prey/owls.txt"))
   },

   "object (transform-string)": {
      init: (state) => ({
         "main": {
            src: "birds/owls.txt",
            dest: "birds/",
            transforms: [() => "maybe"]
         }
      }),
      test: () => assert_equal(read("birds/owls.txt"), "maybe")
   },

   "object (transform-buffer)": {
      init: (state) => ({
         "main": {
            src: "birds/owls.txt",
            dest: "birds/",
            transforms: [() => Buffer.from("maybe")]
         }
      }),
      test: () => assert_equal(read("birds/owls.txt"), "maybe")
   },

   "object (transform-vinyl)": {
      init: (state) => ({
         "main": {
            src: "birds/owls.txt",
            dest: "birds/",
            transforms: [
               (contents, file) => {
                  file.contents = Buffer.from("maybe")
                  return file
               }
            ]
         }
      }),
      test: () => assert_equal(read("birds/owls.txt"), "maybe")
   },

   "object (transform-promise)": {
      init: (state) => ({
         "main": {
            src: "birds/owls.txt",
            dest: "birds/",
            transforms: [async () => "maybe"]
         }
      }),
      test: () => assert_equal(read("birds/owls.txt"), "maybe")
   },

   "object (transform-chain)": {
      init: (state) => ({
         "main": {
            src: "birds/owls.txt",
            dest: "birds/",
            transforms: [
               (contents) => contents + "\n- yes",
               (contents) => Buffer.concat([contents, Buffer.from("\n- no")]),
               (contents, file) => {
                  file.contents = Buffer.concat([file.contents, Buffer.from("\n- maybe")])
                  return file
               },
               async (contents) => contents + "!"
            ]
         }
      }),
      test: () => assert_equal(read("birds/owls.txt"), "Do owls exist?\n- yes\n- no\n- maybe!")
   },

   "object (wrapped callback)": {
      init: (state) => ({
         "main": {
            task: () => {
               state.x = true
            }
         }
      }),
      test: ({x}) => assert_equal(x, true)
   },

   "object (wrapped alias)": {
      init: (state) => ({
         "main": {
            task: "mane"
         },
         "mane": () => {
            state.x = true
         }
      }),
      test: ({x}) => assert_equal(x, true)
   },

   "object (series)": {
      init: (state) => ({
         "main": {
            series: [
               async () => {
                  await sleep(75)
                  state.first = time()
               },
               () => (state.second = time())
            ]
         }
      }),
      test: ({first, second}) => assert_equal(first < second, true)
   },

   "object (parallel)": {
      init: (state) => ({
         "main": {
            parallel: [
               async () => {
                  await sleep(75)
                  state.first = time()
               },
               () => (state.second = time())
            ]
         }
      }),
      test: ({first, second}) => assert_equal(first > second, true)
   },

   "object (invalid src)": {
      init: (state) => ({
         "main": {
            src: "_"
         }
      }),
      error_test: ({message}) => assert_equal(message, "File not found with singular glob: " + __dirname.replace(/\\/g, "/") + "/_ (if this was purposeful, use `allowEmpty` option)")
   },

   "object (invalid transform)": {
      init: (state) => ({
         "main": {
            src: "birds/owls.txt",
            transforms: [() => null]
         }
      }),
      error_test: ({message}) => assert_equal(message, "Transforms must return/resolve with a file, a buffer or a string.")
   }
}

let options = {
   "register (true)": {
      setup: (state) => {
         let tasks = {"main": () => {}}
         let exports = glupost({tasks}, {register: true})
         state.exports = exports
      },
      test: ({exports}) => {
         assert_equal(typeof exports["main"], "function")
         assert_equal(exports["main"], gulp.task("main").unwrap())
      }
   },

   "register (false)": {
      setup: (state) => {
         let tasks = {"main": () => {}}
         let exports = glupost({tasks}, {register: false})
         state.exports = exports
      },
      test: ({exports}) => {
         assert_equal(typeof exports["main"], "function")
         assert_equal(gulp.task("main"), undefined)
      }
   }
}

let invalids = {
   "nonexistent task (string)": {
      error: "Task never defined: ghost.",
      tasks: {
         "main": "ghost"
      }
   },

   "nonexistent task (wrapped)": {
      error: "Task never defined: ghost.",
      tasks: {
         "main": {
            task: "ghost"
         }
      }
   },

   "nonexistent task (series)": {
      error: "Task never defined: ghost.",
      tasks: {
         "main": {
            series: ["ghost"]
         }
      }
   },

   "nonexistent task (parallel)": {
      error: "Task never defined: ghost.",
      tasks: {
         "main": {
            parallel: ["ghost"]
         }
      }
   },

   "nonexistent task (watch)": {
      error: "Task never defined: watch.",
      tasks: {
         "main": "watch"
      }
   },

   "circular aliases (self)": {
      error: "Circular aliases.",
      tasks: {
         "main": "main"
      }
   },

   "circular aliases": {
      error: "Circular aliases.",
      tasks: {
         "A": "B",
         "B": {task: "C"},
         "C": {task: {series: ["D"]}},
         "D": {task: {parallel: ["E"]}},
         "E": {series: ["F"]},
         "F": {parallel: ["A"]}
      }
   },

   "task type": {
      error: "A task must be a string, function, or object.",
      tasks: {
         "main": true
      }
   },

   "noop task": {
      error: "A task must do something.",
      tasks: {
         "main": {}
      }
   },

   "watch without src": {
      error: "No path given to watch.",
      tasks: {
         "main": {
            watch: true,
            task: () => {}
         }
      }
   },

   "src and series/parallel": {
      error: "A task can't have both .src and .task/.series/.parallel properties.",
      tasks: {
         "main": {
            src: "_", series: [], parallel: []
         }
      }
   },

   "series and parallel": {
      error: "A task can only have one of .task/.series/.parallel properties.",
      tasks: {
         "main": {
            series: [], parallel: []
         }
      }
   }
}

let watchers = {
   "watch (true)": {
      init: (state) => ({
         "main": {
            src: "birds/owls.txt",
            dest: "birds/prey/",
            watch: true
         }
      }),
      triggers: [() => write("birds/owls.txt", "no")],
      test: () => assert_equal(read("birds/prey/owls.txt"), "no")
   },

   "watch (path)": {
      init: (state) => ({
         "main": {
            watch: "birds/owls.txt",
            task: () => (state.x = true)
         }
      }),
      triggers: [() => write("birds/owls.txt", "no")],
      test: ({x}) => assert_equal(x, true)
   },

   "watch (multiple changes)": {
      init: (state) => ({
         "main": {
            watch: "birds/owls.txt",
            task: () => (state.x = (state.x ? state.x + 1 : 1))
         }
      }),
      triggers: [
         () => write("birds/owls.txt", "yes"),
         () => write("birds/owls.txt", "no"),
         () => write("birds/owls.txt", "maybe")
      ],
      test: ({x}) => {
         assert_equal(x, 3)
         assert_equal(read("birds/owls.txt"), "maybe")
      }
   },

   "watch (private task)": {
      init: (state) => ({
         "main": {
            series: [
               {
                  watch: "birds/owls.txt",
                  task: () => (state.x = true)
               },
               () => (state.x = false)
            ]
         }
      }),
      triggers: [() => write("birds/owls.txt", "no")],
      test: ({x}) => assert_equal(x, true)
   }
}


// Before/after hooks.
beforeEach(() => write("birds/owls.txt", "Do owls exist?"))
afterEach(() => remove("birds"))

process.on("exit", () => remove("birds"))
process.on("SIGINT", () => remove("birds"))


// Run tests.
describe("tasks", () => {
   let entries = Object.entries(tests)
   for (let [name, {init, test, error_test}] of entries) {
      it(name, async () => {
         let setup = async (state) => {
            let tasks = init(state)
            glupost({tasks}, {register: true})

            await run_task("main")
         }
         await run_test({setup, test, error_test})
      })
   }
})

describe("options", () => {
   let entries = Object.entries(options)
   for (let [name, {setup, test}] of entries)
      it(name, async () => run_test({setup, test}))
})

describe("configuration errors", () => {
   let entries = Object.entries(invalids)
   for (let [name, {tasks, error}] of entries) {
      it(name, async () => {
         let setup = () => glupost({tasks}, {register: true})
         let error_test = ({message}) => assert_equal(message, error)

         await run_test({setup, error_test})
      })
   }
})

describe("watch tasks", () => {
   let entries = Object.entries(watchers)
   for (let [name, {init, triggers, test}] of entries) {
      it(name, async () => {
         let setup = async (state) => {
            let tasks = init(state)
            glupost({tasks}, {register: true})

            // Watch task does not terminate, so instead of invoking it as a gulp task, we execute the
            // unwrapped function synchronously to setup the watchers and get the unwatch callback.
            let unwatch = gulp.task("watch").unwrap()()
            state.unwatch = unwatch
         }
         let wrapped_test = async (state) => {
            let error = null
            try {
               for (let trigger of triggers) {
                  await sleep(75)
                  await trigger()
               }
               await sleep(75)
               test(state)
            }
            catch (e) {
               error = e
            }

            await state.unwatch()

            if (error)
               throw error
         }
         await run_test({setup, test: wrapped_test})
      })
   }
})


class Registry {
   constructor() { this._tasks = {} }
   init() { this._tasks = {} }
   get(name) { return this._tasks[name] }
   set(name, task) { this._tasks[name] = task }
   tasks() { return this._tasks }
}

async function run_test({setup_begin, setup, setup_end, test, error_test}) {
   gulp.registry(new Registry())

   if (test && error_test)
      throw new Error("Pick .test or .error_test")
   if (!test && !error_test)
      throw new Error("Pick .test or .error_test")

   let error = null
   let errored = false
   let state = {}
   try {
      if (setup_begin)
         await setup_begin(state)
      if (setup)
         await setup(state)
      if (setup_end)
         await setup_end(state)
   }
   catch (e) {
      error = e
      errored = true
   }

   if (errored) {
      if (test)
         throw error
      else
         await error_test(error)
   }
   else {
      if (error_test)
         throw new Error("Missing expected exception")
      else
         await test(state)
   }
}

async function run_task(name) {
   return new Promise((resolve, reject) => {
      async_done(gulp.task(name), (error, result) => (error ? reject(error) : resolve(result)))
   })
}

function time() {
   let [s, ns] = process.hrtime()
   return (s * 1000000) + (ns / 1000)
}

function read(path) {
   return fs.readFileSync(path, "utf8")
}

function write(path, content) {
   if (content)
      fs.outputFileSync(path, content)
   else
      fs.ensureDirSync(path)
}

function remove(path) {
   fs.removeSync(path)
}

async function sleep(ms) {
   return new Promise((resolve) => setTimeout(resolve, ms))
}
