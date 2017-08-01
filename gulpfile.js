let gulp = require('gulp');
let typescript = require('gulp-typescript');

gulp.task('build', [], function () {
    gulp.src('src/**/*.ts')
    .pipe(typescript())
    .pipe(gulp.dest('dist/'));
});
