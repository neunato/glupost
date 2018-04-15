"use strict"

const assert  = require("assert")
const gulp    = require("gulp")
const fs      = require("fs-extra")
const glupost = require(".")


// TODO
// - add template tests
// - add watch tests
// - add "Transforms must return/resolve with a file, a buffer or a string." error test

let state


const tests = {

   "function (sync)": {
      task: function(){
         state = true
      },
      test: function(){
         return state === true
      }
   },

   "function (async callback)": {
      task: function(done){
         state = true
         done()
      },
      test: function(){
         return state === true
      }
   },

   "function (async promise)": {
      task: function(){
         state = true
         return Promise.resolve()
      },
      test: function(){
         return state === true
      }
   },

   "alias": {
      task: "function (sync)",
      test: function(){
         return state === true
      }
   },

   "aliased alias": {
      task: "alias",
      test: function(){
         return state === true
      }
   },

   "object (rename)": {
      task: {
         src: "birds/owls.txt",
         rename: "birds/owls-do.txt"
      },
      test: function(){
         return read("birds/owls.txt") === read("birds/owls-do.txt")
      }
   },
   "object (dest)": {
      task: {
         src: "birds/owls.txt",
         dest: "birds/prey/"
      },
      test: function(){
         return read("birds/owls.txt") === read("birds/prey/owls.txt")
      }
   },

   "object (base)": {
      task: {
         src: "birds/owls.txt",
         base: "",
         dest: "birds/prey/"
      },
      test: function(){
         return read("birds/owls.txt") === read("birds/prey/owls.txt")
      }
   },

   "object (transform-string)": {
      task: {
         src: "birds/owls.txt",
         dest: "birds/",         
         transforms: [(contents, file) => "maybe"]
      },
      test: function(){
         return read("birds/owls.txt") === "maybe"
      }
   },

   "object (transform-buffer)": {
      task: {
         src: "birds/owls.txt",
         dest: "birds/",
         transforms: [(contents, file) => Buffer.from("maybe")]
      },
      test: function(){
         return read("birds/owls.txt") === "maybe"
      }
   },

   "object (transform-vinyl)": {
      task: {
         src: "birds/owls.txt",
         dest: "birds/",
         transforms: [(contents, file) => { file.contents = Buffer.from("maybe"); return file }]
      },
      test: function(){
         return read("birds/owls.txt") === "maybe"
      }
   },

   "object (transform-promise)": {
      task: {
         src: "birds/owls.txt",
         dest: "birds/",
         transforms: [(contents, file) => Promise.resolve("maybe")]
      },
      test: function(){
         return read("birds/owls.txt") === "maybe"
      }
   },

   "object (transform-chain)": {
      task: {
         src: "birds/owls.txt",
         dest: "birds/",
         transforms: [
            (contents, file) => contents + "\n- yes",
            (contents, file) => Buffer.concat([contents, Buffer.from("\n- no")]),
            (contents, file) => { file.contents = Buffer.concat([file.contents, Buffer.from("\n- maybe")]); return file }
         ]
      },
      test: function(){
         return read("birds/owls.txt") === "Do owls exist?\n- yes\n- no\n- maybe"
      }
   },

   "object (series)": {
      task: {
         series: [
            (done) => setTimeout( () => { state.first = time(); done() }, 100 ),
            () => state.second = time()
         ]
      },
      test: function(){
         return state.first < state.second
      }
   },

   "object (parallel)": {
      task: {
         parallel: [
            (done) => setTimeout( () => { state.first = time(); done() }, 100 ),
            () => state.second = time()
         ]
      },
      test: function(){
         return state.first > state.second
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

   "series and parallel": {
      error: "A task can't have both .series and .parallel properties.",
      tasks: {
         "task": {
            series: [], parallel: []
         }
      }
   }

}


describe("tasks", function(){

   beforeEach(function(){
      
      write("birds/owls.txt", "Do owls exist?")
      state = {}

   })

   after(cleanup)
   process.on('exit', cleanup)
   process.on('SIGINT', cleanup)



   // Create all tasks.
   const names = Object.keys(tests)
   const tasks = names.reduce(function( result, name ){
      result[name] = tests[name].task
      return result
   }, {})

   glupost({ tasks })


   // Run tests.
   for( const name of names ){
      const { task, test } = tests[name]
      it(name, function(gg){
         gulp.series(
            name,
            done => { try{ assert.ok(test(task)); gg() } catch(e){ gg(e) } done(); }
         )()
      })
   }

})


describe("errors", function(){

   const names = Object.keys(invalids)
   for( const name of names ){
      const config = invalids[name]
      it(name, () => assert.throws(() => glupost(config), e => (e instanceof Error && e.message === config.error)))
   }

})





function time(){
   
   const [s, ns] = process.hrtime()
   return s * 1000000 + ns / 1000

}

function read( path ){

   return fs.readFileSync(path, "utf8")

}

function write( path, content ){

   if( content )
      fs.outputFileSync(path, content)
   else
      fs.ensureDirSync(path)

}

function cleanup(){

   fs.removeSync("./birds")

}


