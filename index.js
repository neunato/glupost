
const through = require("through2");
const gulp = require("gulp");
const plumber = require("gulp-plumber");
const rename = require("gulp-rename");
const Vinyl = require("vinyl");

const configuration = require("../../gulp.config.js");

const tasks = configuration.tasks || {};
const template = configuration.template || {};
const triggered = process.argv.slice(4);


if( tasks.watch )
   throw new Error("`watch` is a reserved task.");

// Implicitly triggered tasks.
if( !triggered.length )
   triggered.push("default");
if( triggered.some(name => tasks[name] && tasks[name].watch) )
   triggered.push("watch");


activate( tasks, triggered );
initialise( tasks, triggered, template );


// Add an `.active` field to tasks as only the triggered
// tasks get defined.
function activate( tasks, triggered ){
   
   // Deactivate all.
   const names = Object.keys(tasks);
   for( const name of names )
      tasks[name].active = false;

   // Activate all that can be reached.
   triggered.forEach(function spread( name ){
      const task = tasks[name];
      if( !task || task.active )
         return;

      task.active = true;
      if( task.deps )
         task.deps.forEach(spread);
   });


   if( triggered.includes("watch") ){
      for( const name of names ){
         const task = tasks[name];
         if( task.watch )
            task.active = true;
      }
   }

}


// Create gulp tasks.
function initialise( tasks, triggered, template ){

   // Expand template object with defaults.
   expand(template, { transforms: [], dest: "." });

   // Create tasks.
   const names = Object.keys(tasks);
   for( const name of names ){
      const task = tasks[name];
      if( !task.active )
         continue;

      // Expand task with template.
      expand(task, template);

      // Construct the pipes.
      const action = task.src ? () => pipify(task) : undefined;
      gulp.task( ...defined(name, task.deps, action) );

   }

   if( !triggered.includes("watch") )
      return;

   // Create the watch task.
   const tracked = spy(tasks);
   const paths = Object.keys(tracked);
   if( !paths.length )
      return;

   gulp.task("watch", function(done){
      for( const path of paths ){
         const names = tracked[path];
         const watcher = gulp.watch(path, names);
         watcher.on("change", event => console.log("           " + event.path + " was " + event.type + ", running tasks..."));
      }
   });

}


// Store watched paths and their tasks.
function spy( tasks ){
   
   const tracked = {};

   const names = Object.keys(tasks);
   for( const name of names ){
      const task = tasks[name];
      if( !task.watch )
         continue;

      const paths = [].concat(task.watch);
      for( const path of paths ){
         if( !tracked[path] )
            tracked[path] = [];
         tracked[path].push(name);
      }
   }

   return tracked;

}


// Convert transform functions to a Stream.
function pipify( task ){

   const options = task.base ? { base: task.base } : {};

   let stream = gulp.src(task.src, options);

   if( task.watch )
      stream = stream.pipe(plumber( message => { console.log(message); this.emit("end") } ));

   for( const transform of task.transforms )
      stream = stream.pipe(pluginate(transform));

   if( task.rename )
      stream = stream.pipe(rename(task.rename));

   if( task.dest )
      stream = stream.pipe(gulp.dest(task.dest));

   return stream;

}


// Convert a string transform function into a stream.
function pluginate( transform ){

   return through.obj(function(file, encoding, done){

      // Nothing to transform.
      if( file.isNull() ){
         done(null, file);
         return;
      }

      // Transform function returns a vinyl file or file contents (in form of a
      // stream, a buffer or a string), or a promise which resolves with those.
      let result = transform( file.contents, file );

      Promise.resolve(result).then(function(result){
         if( !Vinyl.isVinyl(result) ){
            if( result instanceof Buffer )
               file.contents = result;
            else if( typeof result === "string" )
               file.contents = Buffer.from(result);
            else
               throw new Error("Transforms must return/resolve with a file, a buffer or a string.");
         }
         done(null, file);
      }).catch(function(error){
         throw new Error("Failed to streamify transforms.");
      });
      
   });

}


// Add new properties on `from` to `to`.
function expand( to, from ){
   
   const keys = Object.keys(from);
   for( const key of keys ){
      if( !to.hasOwnProperty(key) )
         to[key] = from[key];
   }

}


// Used to skip optional (undefined) arguments.
function defined( ...args ){

   return args.filter( el => el !== undefined );

}