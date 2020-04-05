"use strict"

let fs = require("fs-extra")
let promisify = require('util').promisify
let exec = promisify(require("child_process").exec)
let spawn = require("child_process").spawn
let fkill = require("fkill")
let assert = require("assert")
let assert_equal = assert.deepStrictEqual
let assert_throws = assert.throws
let gulp = require("gulp")
let glupost = require(".")
let async_done = require("async-done")
let Vinyl = require("vinyl")


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
      test: () => assert_equal(read("birds/owls-do.txt"), read("birds/owls.txt"))
   },

   "object (dest)": {
      init: (state) => ({
         "main": {
            src: "birds/owls.txt",
            dest: "birds/prey/"
         }
      }),
      test: () => assert_equal(read("birds/prey/owls.txt"), read("birds/owls.txt"))
   },

   "object (base)": {
      init: (state) => ({
         "main": {
            src: "birds/owls.txt",
            base: "",
            dest: "birds/prey/"
         }
      }),
      test: () => assert_equal(read("birds/prey/owls.txt"), read("birds/owls.txt"))
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

   "object (wrapped function)": {
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
   }
}

let errors = {
   "function": {
      init: (state) => ({
         "main": () => {throw new Error("Ouch.")}
      }),
      error_test: ({message}) => assert_equal(message, "Ouch.")
   },

   "object (src)": {
      init: (state) => ({
         "main": {
            src: "_"
         }
      }),
      error_test: ({message}) => assert_equal(message, "File not found with singular glob: " + __dirname.replace(/\\/g, "/") + "/_ (if this was purposeful, use `allowEmpty` option)")
   },

   "object (transform return value)": {
      init: (state) => ({
         "main": {
            src: "birds/owls.txt",
            transforms: [() => null]
         }
      }),
      error_test: ({message}) => assert_equal(message, "Transforms must return/resolve with a file, a buffer or a string.")
   },

   "object (transform error)": {
      init: (state) => ({
         "main": {
            src: "birds/owls.txt",
            transforms: [() => {throw new Error("Ouch.")}]
         }
      }),
      error_test: ({message}) => assert_equal(message, "Ouch.")
   }
}

let options = {
   "register (true)": {
      setup: (state) => {
         let tasks = {"main": () => {}}
         let options = {register: true}
         let exports = glupost(tasks, options)
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
         let options = {register: false}
         let exports = glupost(tasks, options)
         state.exports = exports
      },
      test: ({exports}) => {
         assert_equal(typeof exports["main"], "function")
         assert_equal(gulp.task("main"), undefined)
      }
   },

   "register (default)": {
      setup: (state) => {
         let tasks = {"main": () => {}}
         let exports = glupost(tasks)
         state.exports = exports
      },
      test: ({exports}) => {
         assert_equal(typeof exports["main"], "function")
         assert_equal(gulp.task("main"), undefined)
      }
   },

   "template (custom)": {
      setup: async (state) => {
         let tasks = {
            "callback": () => {},
            "wrapped callback": {task: () => {}},
            "series": {series: [() => {}]},
            "parallel": {parallel: [() => {}]},
            "object": {src: "_"},
            "wrapped object": {task: {src: "_"}},
         }
         let options = {template: {"dest": "_"}}
         glupost(tasks, options)
         state.tasks = tasks
      },
      test: ({tasks}) => {
         assert_equal(tasks["callback"].dest, undefined)
         assert_equal(tasks["wrapped callback"].dest, undefined)
         assert_equal(tasks["series"].dest, undefined)
         assert_equal(tasks["parallel"].dest, undefined)
         assert_equal(tasks["object"].dest, "_")
         assert_equal(tasks["wrapped object"].task.dest, "_")
      }
   },

   "template (default)": {
      setup: async (state) => {
         let tasks = {"object": {src: "_"}}
         glupost(tasks)
         state.tasks = tasks
      },
      test: ({tasks}) => {
         assert_equal(tasks["object"].dest, ".")
         assert_equal(tasks["object"].transforms, [])
      }
   },

   "logger (null)": {
      setup: async (state) => {
         let unstub = stub_logger("stderr")
         let tasks = {"watch": () => {}}
         let options = {logger: null}
         glupost(tasks, options)
         state.output = unstub()
      },
      test: ({output}) => assert_equal(output, "")
   },

   "logger (console)": {
      setup: async (state) => {
         let unstub = stub_logger("stderr")
         let tasks = {"watch": () => {}}
         let options = {logger: console}
         glupost(tasks, options)
         state.timestamp = timestamp()
         state.output = unstub()
      },
      test: ({output, timestamp}) => assert_equal(output, timestamp + " 'watch' task redefined.\n")
   },

   "logger (custom)": {
      setup: async (state) => {
         state.output = ""
         state.timestamp = timestamp()
         let tasks = {"watch": () => {}}
         let options = {logger: {warn (message) {state.output += message}}}
         glupost(tasks, options)
      },
      test: ({output, timestamp}) => assert_equal(output, timestamp + " 'watch' task redefined.")
   },

   "logger (default)": {
      setup: async (state) => {
         let unstub = stub_logger("stderr")
         let tasks = {"watch": () => {}}
         glupost(tasks)
         state.timestamp = timestamp()
         state.output = unstub()
      },
      test: ({output, timestamp}) => assert_equal(output, timestamp + " 'watch' task redefined.\n")
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

let cli = {
   "function": {
      init: () => glupost({
         "main": () => {}
      }),
      command: "gulp main",
      stdout: `
         [X] Starting 'main'...
         [X] Finished 'main' after [X]
      `
   },

   "alias": {
      init: () => glupost({
         "main": "mane",
         "mane": () => {}
      }),
      command: "gulp main",
      stdout: `
         [X] Starting 'main'...
         [X] Finished 'main' after [X]
      `
   },

   "aliased alias": {
      init: () => glupost({
         "main": "mane",
         "mane": "maine",
         "maine": () => {}
      }),
      command: "gulp main",
      stdout: `
      [X] Starting 'main'...
      [X] Finished 'main' after [X]
      `
   },

   "object (src)": {
      init: () => glupost({
         "main": {
            src: "birds/owls.txt",
            dest: "birds/"
         }
      }),
      command: "gulp main",
      stdout: `
         [X] Starting 'main'...
         [X] Finished 'main' after [X]
      `
   },

   "object (wrapped function)": {
      init: () => glupost({
         "main": {
            task: () => {}
         }
      }),
      command: "gulp main",
      stdout: `
         [X] Starting 'main'...
         [X] Finished 'main' after [X]
      `
   },

   "object (wrapped wrapped function)": {
      init: () => glupost({
         "main": {
            task: {
               task: () => {}
            }
         }
      }),
      command: "gulp main",
      stdout: `
         [X] Starting 'main'...
         [X] Finished 'main' after [X]
      `
   },

   "object (wrapped alias)": {
      init: () => glupost({
         "main": {task: "mane"},
         "mane": "maine",
         "maine": () => {}
      }),
      command: "gulp main",
      stdout: `
         [X] Starting 'main'...
         [X] Finished 'main' after [X]
      `
   },

   "object (series)": {
      init: () => glupost({
         "main": {
            series: [
               "maine",
               {task: "maine"},
               {task: {task: "maine"}},
               () => {},
               function named(){},
               {task: () => {}},
               {task: function named(){}},
               {src: "birds/owls.txt", dest: "birds/"},
               {task: {src: "birds/owls.txt", dest: "birds/"}},
               {series: [() => {}]}
            ]
         },
         "maine": () => {}
      }),
      command: "gulp main",
      stdout: `
         [X] Starting 'main'...
         [X] Starting 'maine'...
         [X] Finished 'maine' after [X]
         [X] Starting 'maine'...
         [X] Finished 'maine' after [X]
         [X] Starting 'maine'...
         [X] Finished 'maine' after [X]
         [X] Starting '<anonymous>'...
         [X] Finished '<anonymous>' after [X]
         [X] Starting 'named'...
         [X] Finished 'named' after [X]
         [X] Starting '<anonymous>'...
         [X] Finished '<anonymous>' after [X]
         [X] Starting 'named'...
         [X] Finished 'named' after [X]
         [X] Starting '<anonymous>'...
         [X] Finished '<anonymous>' after [X]
         [X] Starting '<anonymous>'...
         [X] Finished '<anonymous>' after [X]
         [X] Starting '<anonymous>'...
         [X] Finished '<anonymous>' after [X]
         [X] Finished 'main' after [X]
      `
   },

   "watch task (--beep=false)": {
      init: () => glupost({
         "main": {
            watch: "birds/owls.txt",
            series: [
               "maine",
               {task: "maine"},
               {task: {task: "maine"}},
               () => {},
               function named(){},
               {task: () => {}},
               {task: function named(){}},
               {src: "birds/owls.txt", dest: "birds/prey/"},
               {task: {src: "birds/owls.txt", dest: "birds/prey/"}},
               {series: [() => {}]}
            ]
         },
         "maine": () => {}
      }),
      command: "gulp watch",
      trigger: () => write("birds/owls.txt", "no"),
      stdout: `
         [X] Starting 'watch'...
         [X] Watching 'birds/owls.txt' for changes...
         [X] 'birds/owls.txt' was changed, running 'main'...
         [X] Starting 'main'...
         [X] Starting 'maine'...
         [X] Finished 'maine' after [X]
         [X] Starting 'maine'...
         [X] Finished 'maine' after [X]
         [X] Starting 'maine'...
         [X] Finished 'maine' after [X]
         [X] Starting '<anonymous>'...
         [X] Finished '<anonymous>' after [X]
         [X] Starting 'named'...
         [X] Finished 'named' after [X]
         [X] Starting '<anonymous>'...
         [X] Finished '<anonymous>' after [X]
         [X] Starting 'named'...
         [X] Finished 'named' after [X]
         [X] Starting '<anonymous>'...
         [X] Finished '<anonymous>' after [X]
         [X] Starting '<anonymous>'...
         [X] Finished '<anonymous>' after [X]
         [X] Starting '<anonymous>'...
         [X] Finished '<anonymous>' after [X]
         [X] Finished 'main' after [X]
      `
   },

   "watch task (--beep=true)": {
      init: () => glupost({
         "main": {
            watch: "birds/owls.txt",
            series: [
               "maine",
               {task: "maine"},
               {task: {task: "maine"}},
               () => {},
               function named(){},
               {task: () => {}},
               {task: function named(){}},
               {src: "birds/owls.txt", dest: "birds/prey/"},
               {task: {src: "birds/owls.txt", dest: "birds/prey/"}},
               {series: [() => {}]}
            ]
         },
         "maine": () => {}
      }, {beep: true}),
      command: "gulp watch",
      trigger: () => write("birds/owls.txt", "no"),
      stdout: `
         [X] Starting 'watch'...
         [X] Watching 'birds/owls.txt' for changes...
         [X] 'birds/owls.txt' was changed, running 'main'...
         [X] Starting 'main'...
         [X] Starting 'maine'...
         [X] Finished 'maine' after [X]
         [X] Starting 'maine'...
         [X] Finished 'maine' after [X]
         [X] Starting 'maine'...
         [X] Finished 'maine' after [X]
         [X] Starting '<anonymous>'...
         [X] Finished '<anonymous>' after [X]
         [X] Starting 'named'...
         [X] Finished 'named' after [X]
         [X] Starting '<anonymous>'...
         [X] Finished '<anonymous>' after [X]
         [X] Starting 'named'...
         [X] Finished 'named' after [X]
         [X] Starting '<anonymous>'...
         [X] Finished '<anonymous>' after [X]
         [X] Starting '<anonymous>'...
         [X] Finished '<anonymous>' after [X]
         [X] Starting '<anonymous>'...
         [X] Finished '<anonymous>' after [X]
         [X] Finished 'main' after [X]
         \u0007`
   },

   "watch task error (--beep=false)": {
      init: () => glupost({
         "main": {
            watch: "birds/owls.txt",
            task: () => {throw new Error("Ouch.")}
         }
      }),
      command: "gulp watch",
      trigger: () => write("birds/owls.txt", "no"),
      stdout: `
         [X] Starting 'watch'...
         [X] Watching 'birds/owls.txt' for changes...
         [X] 'birds/owls.txt' was changed, running 'main'...
         [X] Starting 'main'...
      `,
      stderr: `
         [X] 'main' errored after [X]
         [X] Error: Ouch.
         at [X]...
      `
   },

   "watch task error (--beep=true)": {
      init: () => glupost({
         "main": {
            src: "birds/owls.txt",
            watch: true,
            transforms: [() => null]
         }
      }, {beep: true}),
      command: "gulp watch",
      trigger: () => write("birds/owls.txt", "no"),
      stdout: `
         [X] Starting 'watch'...
         [X] Watching 'birds/owls.txt' for changes...
         [X] 'birds/owls.txt' was changed, running 'main'...
         [X] Starting 'main'...
      `,
      stderr: `
         [X] 'main' errored after [X]
         [X] Error: Transforms must return/resolve with a file, a buffer or a string.
         at [X]...
         \x07\x07\x07`
   },

   "gulp --tasks": {
      init: () => glupost({
         "A": "B",
         "B": {task: "C"},
         "C": () => {},
         "D": {
            series: [
               "A",
               "B",
               "C",
               function D(){},
               () => {},
               {src: " "},
               {task: () => {}},
               {parallel: [() => {}]
            }
         ]},
      }),
      command: "gulp --tasks",
      stdout: `
         [X] ├── A
         [X] ├── B
         [X] ├── C
         [X] └─┬ D
         [X]   └─┬ <series>
         [X]     ├── A
         [X]     ├── B
         [X]     ├── C
         [X]     ├── D
         [X]     ├── <anonymous>
         [X]     ├── <anonymous>
         [X]     ├── <anonymous>
         [X]     └─┬ <parallel>
         [X]       └── <anonymous>
      `
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
   for (let [name, {init, test}] of entries) {
      it(name, async () => {
         let setup = async (state) => {
            let tasks = init(state)
            glupost(tasks, {register: true})

            await run_task("main")
         }
         await run_test({setup, test})
      })
   }
})

describe("runtime errors", () => {
   let entries = Object.entries(errors)
   for (let [name, {init, error_test}] of entries) {
      it(name, async () => {
         let setup = async (state) => {
            let tasks = init(state)
            glupost(tasks, {register: true})

            await run_task("main")
         }
         await run_test({setup, error_test})
      })
   }
})

describe("setup errors", () => {
   let entries = Object.entries(invalids)
   for (let [name, {tasks, error}] of entries) {
      it(name, async () => {
         let setup = () => glupost(tasks, {register: true})
         let error_test = ({message}) => assert_equal(message, error)

         await run_test({setup, error_test})
      })
   }
})

describe("options", () => {
   let entries = Object.entries(options)
   for (let [name, {setup, test}] of entries)
      it(name, async () => run_test({setup, test}))
})

describe("watch tasks", () => {
   let entries = Object.entries(watchers)
   for (let [name, {init, triggers, test}] of entries) {
      it(name, async () => {
         let setup = async (state) => {
            let tasks = init(state)
            glupost(tasks, {logger: null, register: true})

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

describe("command line output", () => {
   let entries = Object.entries(cli)
   for (let [name, {init, command, trigger, stdout="", stderr=""}] of entries) {
      it(name, async () => {
         let setup = async (state) => {
            let gulpfile = `
               'use strict'
               let glupost = require('.')
               module.exports = (${init.toString()})()`
            write("test_gulpfile.js", gulpfile)

            command = command.replace(/^gulp/, "gulp --gulpfile test_gulpfile.js")

            if (trigger) {
               let args = command.slice(5).split(" ")
               let gulp = spawn("gulp", args, {shell: true})
               state.gulp = gulp
               await sleep(1000)
            }
            else {
               let {stdout, stderr} = await exec(command)
               state.stdout = stdout
               state.stderr = stderr
            }
            return state
         }
         let test = async (state) => {
            let expected_stdout = stdout
            let expected_stderr = stderr
            stdout = ""
            stderr = ""
            if (trigger) {
               let child = state.gulp
               child.stdout.on("data", (s) => stdout += s)
               child.stderr.on("data", (s) => stderr += s)
               await trigger()
               await fkill(child.pid, {"force": true})
            }
            else {
               stdout = state.stdout
               stderr = state.stderr
            }

            stdout = stdout.replace(/^\[.+?] /gm, "[X] ")
            stdout = stdout.replace(/after [\d.]+ .?s$/gm, "after [X]")
            stdout = stdout.replace(/\[X] (?:Using gulpfile|Tasks for) .+\n/, "")

            stderr = stderr.replace(/^\[.+?] /gm, "[X] ")
            stderr = stderr.replace(/after [\d.]+ .?s$/gm, "after [X]")
            stderr = stderr.replace(/(\s+at .+?\n)+/, "\nat [X]...\n")

            expected_stdout = expected_stdout.replace(/^\s+/gm, "")
            expected_stderr = expected_stderr.replace(/^\s+/gm, "")

            assert_equal(stderr, expected_stderr)
            assert_equal(stdout, expected_stdout)
         }
         let cleanup = () => {
            remove("test_gulpfile.js")
         }

         await run_test({setup, test, cleanup})
      })
   }
})


async function run_test({setup_begin, setup, setup_end, test, error_test, cleanup}) {
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

   if (cleanup)
      await cleanup()
}

async function run_task(name) {
   return new Promise((resolve, reject) => {
      async_done(gulp.task(name), (error, result) => (error ? reject(error) : resolve(result)))
   })
}

function stub_logger(descriptor) {
   descriptor = process[descriptor]
   let captured = ""
   let write = descriptor.write
   descriptor.write = (string) => (captured += string)
   let unstub_logger = () => {
      descriptor.write = write
      return captured
   }
   return unstub_logger
}

function time() {
   let [s, ns] = process.hrtime()
   return (s * 1000000) + (ns / 1000)
}

function timestamp() {
   return "[" + new Date().toLocaleTimeString("hr-HR") + "]"
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
