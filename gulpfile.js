var gulp = require('gulp');
var clientjade = require('gulp-clientjade');
var uglify = require('gulp-uglify');
var concat = require('gulp-concat');


gulp.task('jade', function() {
	return gulp.src('./views/*.jade')
	.pipe(clientjade('templates.js'))
	.pipe(gulp.dest('./lib'))
});

gulp.task('merge', ['jade'], function() {
	return gulp.src(['./node_modules/async/lib/async.js', './lib/templates.js'])
	.pipe(concat('qamar.js'))
	.pipe(gulp.dest('./dist'))
});

gulp.task('build', ['merge'], function(){
	return gulp.src(['./dist/qamar.js'])
	.pipe(uglify())
	.pipe(gulp.dest('./dist/min'))
})
gulp.task('default', ['build']);