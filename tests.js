"use strict"

const assert = require("assert")
const gulp = require("gulp")
const fs = require("fs-extra")
const glupost = require(".")
const Vinyl = require("vinyl")


// TODO
// - add template tests
// - add "Transforms must return/resolve with a file, a buffer or a string." error test

let state

const tests = {

   "function (sync)": {
      task() {
         state = true
      },
      test() {
         return state === true
      }
   },

   "function (async callback)": {
      task(done) {
         state = true
         done()
      },
      test() {
         return state === true
      }
   },

   "function (async promise)": {
      task() {
         state = true
         return Promise.resolve()
      },
      test() {
         return state === true
      }
   },

   "alias": {
      task: "function (sync)",
      test() {
         return state === true
      }
   },

   "aliased alias": {
      task: "alias",
      test() {
         return state === true
      }
   },

   "object (Vinyl src)": {
      task: {
         src: new Vinyl({
            path: "birds/owls.txt",
            contents: Buffer.from("maybe")
         })
      },
      test() {
         return read("birds/owls.txt") === "maybe"
      }
   },

   "object (rename)": {
      task: {
         src: "birds/owls.txt",
         rename: "birds/owls-do.txt"
      },
      test() {
         return read("birds/owls.txt") === read("birds/owls-do.txt")
      }
   },

   "object (dest)": {
      task: {
         src: "birds/owls.txt",
         dest: "birds/prey/"
      },
      test() {
         return read("birds/owls.txt") === read("birds/prey/owls.txt")
      }
   },

   "object (base)": {
      task: {
         src: "birds/owls.txt",
         base: "",
         dest: "birds/prey/"
      },
      test() {
         return read("birds/owls.txt") === read("birds/prey/owls.txt")
      }
   },

   "object (transform-string)": {
      task: {
         src: "birds/owls.txt",
         dest: "birds/",
         transforms: [() => "maybe"]
      },
      test() {
         return read("birds/owls.txt") === "maybe"
      }
   },

   "object (transform-buffer)": {
      task: {
         src: "birds/owls.txt",
         dest: "birds/",
         transforms: [() => Buffer.from("maybe")]
      },
      test() {
         return read("birds/owls.txt") === "maybe"
      }
   },

   "object (transform-vinyl)": {
      task: {
         src: "birds/owls.txt",
         dest: "birds/",
         transforms: [
            (contents, file) => {
               file.contents = Buffer.from("maybe")
               return file
            }
         ]
      },
      test() {
         return read("birds/owls.txt") === "maybe"
      }
   },

   "object (transform-promise)": {
      task: {
         src: "birds/owls.txt",
         dest: "birds/",
         transforms: [() => Promise.resolve("maybe")]
      },
      test() {
         return read("birds/owls.txt") === "maybe"
      }
   },

   "object (transform-chain)": {
      task: {
         src: "birds/owls.txt",
         dest: "birds/",
         transforms: [
            (contents) => `${contents}\n- yes`,
            (contents) => Buffer.concat([contents, Buffer.from("\n- no")]),
            (contents, file) => {
               file.contents = Buffer.concat([file.contents, Buffer.from("\n- maybe")])
               return file
            }
         ]
      },
      test() {
         return read("birds/owls.txt") === "Do owls exist?\n- yes\n- no\n- maybe"
      }
   },

   "object (task callback)": {
      task: {
         task: () => (state = true)
      },
      test() {
         return state === true
      }
   },

   "object (task object)": {
      task: {
         task: "object (task callback)"
      },
      test() {
         return state === true
      }
   },

   "object (series)": {
      task: {
         series: [
            (done) => setTimeout(() => {
               state.first = time()
               done()
            }, 100),
            () => (state.second = time())
         ]
      },
      test() {
         return state.first < state.second
      }
   },

   "object (parallel)": {
      task: {
         parallel: [
            (done) => setTimeout(() => {
               state.first = time()
               done()
            }, 100),
            () => (state.second = time())
         ]
      },
      test() {
         return state.first > state.second
      }
   }

}

const watchers = {

   "watch (true)": {
      task: {
         src: "birds/owls.txt",
         rename: "birds/owls-dont.txt",
         watch: true
      },
      triggers: [() => write("birds/owls.txt", "no")],
      test() {
         return read("birds/owls-dont.txt") === "no"
      }
   },

   "watch (path)": {
      task: {
         watch: "birds/owls.txt",
         task: () => (state = true)
      },
      triggers: [() => write("birds/owls.txt", "no")],
      test() {
         return state === true
      }
   },

   "watch (multiple changes)": {
      task: {
         watch: "birds/owls.txt",
         task: () => (state = typeof state === "number" ? state + 1 : 1)
      },
      triggers: [() => write("birds/owls.txt", "yes"), () => write("birds/owls.txt", "no"), () => write("birds/owls.txt", "maybe")],
      test() {
         return state === 3
      }
   }

}

const invalids = {

   "nonexistent task": {
      error: 'Task "ghost" does not exist.',
      tasks: {
         "alias": "ghost"
      }
   },

   "circular aliases": {
      error: "Circular aliases.",
      tasks: {
         "alias": "ghost",
         "ghost": "alias"
      }
   },

   "task type": {
      error: "A task must be a string, function, or object.",
      tasks: {
         "task": true
      }
   },

   "noop task": {
      error: "A task must do something.",
      tasks: {
         "task": {}
      }
   },

   "watch without src": {
      error: "No path given to watch.",
      tasks: {
         "task": {
            watch: true
         }
      }
   },

   "src and series/parallel": {
      error: "A task can't have both .src and .task/.series/.parallel properties.",
      tasks: {
         "task": {
            src: " ", series: [], parallel: []
         }
      }
   },

   "series and parallel": {
      error: "A task can only have one of .task/.series/.parallel properties.",
      tasks: {
         "task": {
            series: [], parallel: []
         }
      }
   }

}



// Prepare test files and cleanup routine.

function prepare() {

   beforeEach(() => {
      write("birds/owls.txt", "Do owls exist?")
      state = {}
   })

   after(cleanup)
   process.on("exit", cleanup)
   process.on("SIGINT", cleanup)

}

// Destroy test files.

function cleanup() {

   fs.removeSync("./birds")

}



describe("tasks", () => {

   prepare()

   // Create tasks.
   const names = Object.keys(tests)
   const tasks = names.reduce((result, name) => {
      result[name] = tests[name].task
      return result
   }, {})

   glupost({ tasks })


   // Run tests.
   for (const name of names) {
      const { test } = tests[name]
      it(name, (done) => {
         gulp.series(
            name,
            () => {
               try {
                  assert.ok(test())
                  done()
               }
               catch (e) {
                  done(e)
               }
            }
         )()
      })
   }

})

describe("watch tasks", () => {

   prepare()

   // Create tasks.
   const names = Object.keys(watchers)
   const tasks = names.reduce((result, name) => {
      result[name] = watchers[name].task
      return result
   }, {})

   glupost({ tasks })


   // Run tests.
   for (const name of names) {
      const { task, triggers, test } = watchers[name]
      it(name, (done) => {
         const watcher = gulp.watch(task.watch, { delay: 0 }, gulp.task(name))
         watcher.on("ready", triggers.shift())
         watcher.on("change", () => {

            // Gulp watch uses a `setTimeout` with the previously defined `delay` (0), meaning we have to wait
            // awhile (50ms seems to work) for the task to start.
            setTimeout(() => {

               // Not the last trigger - call the next one in 100ms. I couldn't find the `chokidar` option that
               // regulates the interval needed to pass for the next change to register successfully. Either way,
               // this sort of delay simulates real world edits, which is ok I guess.
               if (triggers.length) {
                  setTimeout(triggers.shift(), 100)
                  return
               }

               try {
                  assert.ok(test())
                  done()
               }
               catch (e) {
                  done(e)
               }
               watcher.close()

            }, 50)

         })

      })
   }

})

describe("errors", () => {

   const names = Object.keys(invalids)
   for (const name of names) {
      const config = invalids[name]
      it(name, () => assert.throws(() => glupost(config), (e) => e instanceof Error && e.message === config.error))
   }

})



function time() {

   const [s, ns] = process.hrtime()
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
