# glupost

A declarative approach at gulp.

`gulpfile.js` is replaced by `gulp.config.js` where the tasks are configured.

## Usage

Running

```
glupost md-to-html
```

with a `gulp.config.js`

```javascript
// Transforms.
const toc    = (contents, file) => require("gulp-markdown-toc")();
const marked = (contents, file) => require("marked")(contents);

const configuration = {
  
  template: {
    base: "src/",
    dest: "dist/"
  },

  tasks: {
    "md-to-html": {
      src: "src/docs/*.md",
      watch: "src/docs/*.md",
      rename: { extname: ".html" },
      transforms: [ toc, marked ]
    },
    "default": {
      deps: ["md-to-html", "watch"]
    }
  }

};

module.exports = configuration;
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

would write

```
├── dist/
│   ├── docs/
│   │   ├── Getting started.html
│   │   ├── API.html
│   │   ├── Guidelines.html
│   │   └── Examples.html
```



## API

### gulp.config.js

A simple node module exporting a configuration object like __`{ tasks [, template] }`__.

__tasks__ is an object containing configured tasks, invoked by running `glupost <name>`.

__template__ is a an object serving as a base for all tasks.

_Note: gulp.config.js also acts as a normal gulpfile which means you can freely use the [gulp interface](https://github.com/gulpjs/gulp/blob/master/docs/API.md)._

-----

Declaration of a task (or template) takes form in an object:

- __task.src__

  Passed to [gulp.src()](https://github.com/gulpjs/gulp/blob/master/docs/API.md#gulpsrcglobs-options) to start the stream.

- __task.dest__

  Passed to [gulp.dest()](https://github.com/gulpjs/gulp/blob/master/docs/API.md#gulpdestpath-options) to output the files.

- __task.base__

  Passed as [base](https://github.com/gulpjs/gulp/blob/master/docs/API.md#optionsbase) option to gulp.src().

- __task.rename__

  Passed to [gulp-rename](https://github.com/hparra/gulp-rename) prior to writing.

- __task.deps__

  Dependency tasks.

- __task.watch__

  Paths used by [gulp.watch()](https://github.com/gulpjs/gulp/blob/master/docs/API.md#gulpwatchglob--opts-tasks-or-gulpwatchglob--opts-cb) to trigger the task. Watchers are invoked by the reserved _watch_ task.

- __task.transforms__

  Array of transform functions which receive [file.contents](https://github.com/gulpjs/vinyl#filecontents) and [file](https://github.com/gulpjs/vinyl) parameters and must return a vinyl file or its contents directly (in form of a string or a buffer), or a promise which resolves with one of those.

  ```javascript
  // Return string directly.
  function copyright( contents ){
    return contents + "\nCopyright © 2017";
  }

  // Return vinyl file.
  function copyright( contents, file ){
    const suffix = new Buffer("\nCopyright © 2017");
    file.contents = Buffer.concat(contents, suffix);
    return file;
  }

  // Return promise.
  function copyright( contents ){
    return Promise.resolve(contents + "\nCopyright © 2017");
  }

  ```
