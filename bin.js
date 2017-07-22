#!/usr/bin/env node

const exec = require("child_process").exec;
const resolve = require("path").resolve;

const cwd = resolve(process.argv[1], "..") + "/";
const main = resolve(cwd + "../..");
const gulp = resolve(cwd + "../.bin/gulp");
const gulpfile = resolve(cwd + "/index.js");
const tasks = process.argv.slice(2).join(" ");

const subprocess = exec(gulp + " --cwd " + main + " --gulpfile " + gulpfile + " " + tasks);
subprocess.stdout.pipe(process.stdout);
subprocess.stderr.pipe(process.stderr);