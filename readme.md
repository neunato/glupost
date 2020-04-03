# glupost

Build your gulp tasks from a configuration object.


### Usage

Running

```
gulp start
```

with a `gulpfile.js`

```javascript
// Transforms/plugins.
let toc = require("gulp-markdown-toc")()
let marked = (contents, file) => require("marked")(contents)


// Build tasks.
let tasks = {
   "md-to-html": {
      src: "src/docs/*.md",
      rename: {extname: ".html"},
      transforms: [toc, marked],
      watch: true
   },
   "start": {
      series: ["md-to-html", "watch"]
   }
}

let options = {
   template = {
      base: "src/",
      dest: "dist/"
   }
}

// Build the actual tasks.
let glupost = require("glupost")
module.exports = glupost(tasks, options)
```

and a file structure

```
├── src/
│   ├── docs/
│   │   ├── Getting started.md
│   │   ├── API.md
│   │   ├── Guidelines.md
│   │   └── Examples.md
```

would run `start`, that is, `md-to-html` and `watch` in series, producing

```
├── dist/
│   ├── docs/
│   │   ├── Getting started.html
│   │   ├── API.html
│   │   ├── Guidelines.html
│   │   └── Examples.html
```

once initially, and again on every file change.


### API

### `glupost(tasks[, options])`

Return an object containing gulp tasks ready for registration.

<br>

__`tasks`__ » object declaring the tasks, invoked by `gulp <task>`.

__`options.template`__ » object serving as a base for tasks with `.src`.

__`options.beep`__ » boolean controlling if a beep sound is played once all watch-triggered tasks execute. `false` by default.

__`options.register`__ » boolean controlling if tasks are registered to gulp or not. `false` by default.


-----

Declaration of a task takes one of the following forms:

```javascript
{
   // Name of another task.
   "alias": "another task",

   // Function.
   "sync callback": () => {},
   "async callback": (done) => done(),
   "async promise": async () => {},

   // Task object.
   "vinyl stream task": {
      src: "path",
      dest: "."
   },
   "wrapped": {
      task: () => {}
   },
   "tasks in series": {
      series: [...]
   },
   "tasks in parallel": {
      parallel: [...]
   }
}
```

_A composition task object accepts one of:_

__`.task`__ » wrapper around a task, useful for `{watch: "path", task: () => {}}`.

__`.series`__ » passed to [gulp.series()](https://gulpjs.com/docs/en/api/series), but also accepts task objects.

__`.parallel`__ » passed to [gulp.parallel()](https://gulpjs.com/docs/en/api/parallel), but also accepts task objects.


<br>

_A Vinyl stream task object (and `options.template`) accepts:_

__`.src`__ » string passed to [gulp.src()](https://gulpjs.com/docs/en/api/src) to start the stream or a [Vinyl](https://gulpjs.com/docs/en/api/vinyl) file.

__`.dest`__ » passed to [gulp.dest()](https://gulpjs.com/docs/en/api/dest) to output the files. Defaults to gulp's working directory.

__`.base`__ » passed as [base](https://gulpjs.com/docs/en/api/src#options) option to gulp.src().

__`.rename`__ » passed to [gulp-rename](https://github.com/hparra/gulp-rename) prior to writing.

__`.transforms`__ » array of transform functions that receive [file.contents](https://gulpjs.com/docs/en/api/vinyl#options) and [file](https://gulpjs.com/docs/en/api/vinyl) parameters and must return a Vinyl file or its contents directly (as string or buffer), or a promise that resolves with one of those.

  ```javascript
  // Return string directly.
  function copyright(contents) {
    return contents + "\nCopyright © 2017"
  }

  // Return Vinyl file.
  function copyright(contents, file) {
    let suffix = Buffer.from("\nCopyright © 2017")
    file.contents = Buffer.concat(contents, suffix)
    return file
  }

  // Return promise.
  async function copyright(contents) {
    return contents + "\nCopyright © 2017"
  }
  ```

<br>

_All task objects accept:_

__`.watch`__ » paths used by [gulp.watch()](https://gulpjs.com/docs/en/api/watch) to trigger the task. If set to `true`, the task's `.src` will be watched. All watchers are invoked by the generated _watch_ task.
