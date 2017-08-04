let gulp = require('gulp');
let typescript = require('gulp-typescript');
const tsProject = typescript.createProject('tsconfig.json');

gulp.task('build', [], function () {
    return tsProject.src()
    .pipe(tsProject())
    .js.pipe(gulp.dest('dist/'));
});
