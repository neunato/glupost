# glupost

A declarative approach at gulp.


### Usage

Running

```
node_modules/.bin/gulp
```

with a `gulpfile.js`

```javascript
// Transforms/plugins.
const toc    = require("gulp-markdown-toc")()
const marked = (contents, file) => require("marked")(contents)

// Declared tasks.
const configuration = {
  
  template: {
    base: "src/",
    dest: "dist/"
  },

  tasks: {
    "md-to-html": {
      src: "src/docs/*.md",
      watch: true,
      rename: { extname: ".html" },
      transforms: [toc, marked]
    },
    "default": {
      series: ["md-to-html", "watch"]
    }
  }

}

// Build the actual tasks.
const glupost = require("glupost")
glupost(configuration)
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

would run `md-to-html` and `watch` in series, producing

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

The module exports a function expecting a configuration object like __`{ tasks [, template] }`__.

- __tasks__ is an object containing configured tasks, invoked by `gulp <task>`.

- __template__ is a an object serving as a base for all tasks.


-----

Declaration of a task takes one of the following forms:

```javascript
{
  // Name of another task.
  "task1": "task2",

  // Callback function.
  "task2": () => console.log("task2 started."),

  // Configuration object.
  "task3": {
    series: ["task1", () => console.log("task2 ended.")]
  }
}
```

A task (or template) configuration object accepts:

- __task.src__

  Passed to [gulp.src()](https://github.com/gulpjs/gulp/blob/4.0/docs/API.md#gulpsrcglobs-options) to start the stream.

- __task.dest__

  Passed to [gulp.dest()](https://github.com/gulpjs/gulp/blob/4.0/docs/API.md#gulpdestpath-options) to output the files. Defaults to gulp's working directory.

- __task.base__

  Passed as [base](https://github.com/gulpjs/gulp/blob/4.0/docs/API.md#optionsbase) option to gulp.src().

- __task.rename__

  Passed to [gulp-rename](https://github.com/hparra/gulp-rename) prior to writing.

- __task.transforms__

  Array of transform functions which receive [file.contents](https://github.com/gulpjs/vinyl#filecontents) and [file](https://github.com/gulpjs/vinyl) parameters and must return a vinyl file or its contents directly (in form of a string or a buffer), or a promise which resolves with one of those.
 
  ```javascript
  // Return string directly.
  function copyright( contents ){
    return contents + "\nCopyright © 2017";
  }

  // Return vinyl file.
  function copyright( contents, file ){
    const suffix = Buffer.from("\nCopyright © 2017");
    file.contents = Buffer.concat(contents, suffix);
    return file;
  }

  // Return promise.
  function copyright( contents ){
    return Promise.resolve(contents + "\nCopyright © 2017");
  }
  ```

- __task.series__

  Passed to [gulp.series()](https://github.com/gulpjs/gulp/blob/4.0/docs/API.md#gulpseriestasks), but also accepts task configuration objects.

- __task.parallel__

  Passed to [gulp.parallel()](https://github.com/gulpjs/gulp/blob/4.0/docs/API.md#gulpparalleltasks), but also accepts task configuration objects.

- __task.watch__

  Paths used by [gulp.watch()](https://github.com/gulpjs/gulp/blob/4.0/docs/API.md#gulpwatchglobs-opts-fn) to trigger the task. If set to `true`, the task's `.src` will be watched. All watchers are invoked by the generated _watch_ task. May only appear in top level (named) tasks.


 If a task has both `.src` and `.series`/`.parallel` defined, the transform function is appended to the end of the sequence.