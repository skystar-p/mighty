let gulp = require('gulp');
let typescript = require('gulp-typescript');
const tsProject = typescript.createProject('tsconfig.json');

gulp.task('build', [], function () {
    gulp.pipe(tsProject())
    .pipe(gulp.dest('dist/'));
});
