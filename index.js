"use strict"


const gulp = require("gulp")
const rename = require("gulp-rename")
const through = require("through2")
const forward = require("undertaker-forward-reference")
const Vinyl = require("vinyl")


// Enable forward referenced tasks.
gulp.registry(forward())



module.exports = glupost


function retrieve(tasks, alias) {

   if (typeof tasks[alias] !== "string")
      return tasks[alias]

   const found = new Set([alias])

   let task = tasks[alias]
   do {
      if (found.has(task))
         throw new Error("Circular aliases.")
      found.add(task)
      if (!tasks[task])
         throw new Error(`Task "${task}" does not exist.`)
      task = tasks[task]
   } while (typeof task === "string")
   return task

}

// Create gulp tasks.
function glupost(configuration) {

   const tasks = configuration.tasks || {}
   const template = configuration.template || {}

   // Expand template object with defaults.
   expand(template, { transforms: [], dest: "." })


   // Create tasks.
   const names = Object.keys(tasks)
   for (const name of names) {
      const task = retrieve(tasks, name)

      if (typeof task === "object")
         expand(task, template)

      gulp.task(name, compose(task))
   }

   watch(tasks)

}


// Convert task object to a function.
function compose(task) {

   // Already composed action.
   if (task.action)
      return task.action

   // 1. named task.
   if (typeof task === "string")
      return task

   // 2. a function directly.
   if (typeof task === "function")
      return task.length ? task : () => Promise.resolve(task())

   // 3. task object.
   if (typeof task !== "object")
      throw new Error("A task must be a string, function, or object.")

   if (task.watch === true) {
      // Watching task without a valid path.
      if (!task.src)
         throw new Error("No path given to watch.")
      task.watch = task.src
   }


   let transform

   if (task.src)
      transform = () => pipify(task)

   // No transform function and no series/parallel.
   if (!transform && !task.series && !task.parallel)
      throw new Error("A task must do something.")

   // Both series and parallel.
   if (task.series && task.parallel)
      throw new Error("A task can't have both .series and .parallel properties.")

   // Only transform function.
   if (!task.series && !task.parallel) {
      task.action = transform
   }

   // Series/parallel sequence of tasks.
   else {
      const sequence = task.series ? "series" : "parallel"
      if (transform)
         task[sequence].push(transform)
      task.action = gulp[sequence](...task[sequence].map(compose))
   }

   return task.action

}


// Convert transform functions to a Stream.
function pipify(task) {

   const options = task.base ? { base: task.base } : {}

   let stream = gulp.src(task.src, options)

   // This is used to abort any further transforms in case of error.
   const state = { error: false }

   for (const transform of task.transforms)
      stream = stream.pipe(transform.pipe ? transform : pluginate(transform, state))

   if (task.rename)
      stream = stream.pipe(rename(task.rename))

   if (task.dest)
      stream = stream.pipe(gulp.dest(task.dest))

   return stream

}


// Convert a string transform function into a stream.
function pluginate(transform, state) {

   return through.obj((file, encoding, done) => {

      // Nothing to transform.
      if (file.isNull() || state.error) {
         done(null, file)
         return
      }

      // Transform function returns a vinyl file or file contents (in form of a
      // stream, a buffer or a string), or a promise which resolves with those.
      new Promise((resolve, reject) => {
         try {
            resolve(transform(file.contents, file))
         }
         catch (e) {
            reject(e)
         }
      }).then((result) => {
         if (!Vinyl.isVinyl(result)) {
            if (result instanceof Buffer)
               file.contents = result
            else if (typeof result === "string")
               file.contents = Buffer.from(result)
            else
               throw new Error("Transforms must return/resolve with a file, a buffer or a string.")
         }
      }).catch((e) => {
         console.error(e)
         state.error = true
      }).then(() => {
         done(null, file)
      })

   })

}


// Create the watch task if declared and triggered.
// Only top level tasks may be watched.
function watch(tasks) {

   if (tasks["watch"]) {
      console.warn("`watch` task redefined.")
      return
   }

   const names = Object.keys(tasks).filter((name) => tasks[name].watch)
   if (!names.length)
      return


   gulp.task("watch", () => {
      for (const name of names) {
         const glob = tasks[name].watch
         const watcher = gulp.watch(glob, gulp.task(name))
         watcher.on("change", (path) => console.log(`${timestamp()} '${path}' was changed, running tasks...`))
      }
   })

}



// Add new properties on `from` to `to`.
function expand(to, from) {

   const keys = Object.keys(from)
   for (const key of keys) {
      if (!to.hasOwnProperty(key))
         to[key] = from[key]
   }

}


function timestamp() {

   const time = new Date()
   const hours = `0${time.getHours()}`.slice(-2)
   const minutes = `0${time.getMinutes()}`.slice(-2)
   const seconds = `0${time.getSeconds()}`.slice(-2)
   return `[${hours}:${minutes}:${seconds}]`

}

