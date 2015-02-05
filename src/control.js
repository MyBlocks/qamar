var store = new BankersBox(1);
jade.render = function (template, locals) {
	locals = locals || {};
	return jade.templates[template](locals)
}
function _log(msg){
	var t = new Date().toString();
	$("#__log").prepend('<h6>' + t + " - " + msg + '</h6>');
}
var announce_account = 'qamar_announce';
async.waterfall([
	function loadSettings(fn){
		_log('loading settings from @' + announce_account);
		getTweets(announce_account, fn)
	},
	function parseSettings(settings, fn) {
		if(!settings.length){
			return fn("no settings found!");
		}
		settings.forEach(function(prop){
			var prop = prop.trim().split(" ");
			var key = prop[0];
			var val = prop[1];
			store.sadd(key, val);
		});
		_log('settings updated');
		fn();
	},
	updateBlocklist
]);

function updateBlocklist(fn){
	var list = store.smembers('blocklist');
	if(!list || !list.length){
		return _log("no blocklist found");
	}
	_log('getting blocklist');
	async.eachSeries(list, function get(u, done){
		getTweets(u, function(err, t){
			var c = 0;
			t.forEach(function (tw) {
				var users = tw.trim().split(" ");
				users.forEach(function(user){
					c = c + store.sadd('blocklist:users', user);
				});
			})
			_log('updated blocklist with ' + c + ' new users');
			done();
		});
	}, fn)
}


var _xhr;
var h = [
	'<br />',
	'<div>',
	"<div><h2>1. Broadcast a tweet to many people</h2></div>",
	"<br /><div><input style='width:310px' id='_username' type='text' placeholder='@Username of the source to get list of followers'></div>",
	"<br /><div><textarea id='_msg' placeholder='Message to broadcast'></textarea></div>",
	"<br /><div><label><input id='_append' type='checkbox'> Append message after mentions</div></label>",
	"<br /><div><button type='button' class='btn' id='_start'>Start</button></div>",
	"<br /><div id='_progress'><div>",
	"</div>"
].join('');
var main = jade.render('main');
$("body").append(main);


var cursor;

function getTweets(u, fn){
	var tweets = [];
	var t = 0;
	var mid;
	async.doWhilst(
		function g(done){ 
			_log('getting tweets ' + (++t));
			var q = {};
			if(mid){
				q.contextual_tweet_id = mid;
				q.max_id = mid;
			}
			$.getJSON('/i/profiles/show/' + u + '/timeline', q, function(res){
				if(res.inner.items_html != ""){
					var html = $(res.inner.items_html);
					mid = html.find(".js-stream-item:last").attr('data-item-id');
					console.dir(html);
					tweets.push(res.inner.items_html);
				}else{
					mid = void 0;
				}
				done();
			});
		},
		function test(){
			return mid != undefined;
		},
	 	function(){
	 		var f =[];
	 		cleanTweets(tweets).forEach(function(fol){
	 			f = f.concat(fol);
	 		});
	 		fn(null, f);
	 	}
	 );	
}

function getFollowers(u, fn){
	var followers = [];
	var t = 0;
	async.doWhilst(
		function g(done){ 
			_log('getting followers ' + (++t));
			var q = {};
			if(cursor){
				q.cursor = cursor;
			}
			$.getJSON('/'+u+'/followers/users', q, function(res){
				cursor = res.cursor == "0" ? void 0 : res.cursor;
				followers.push(res.items_html);
				done();
			});
		},
		function test(){
			return cursor != undefined;
		},
	 	function(){
	 		var f =[];
	 		cleanFollowers(followers).forEach(function(fol){
	 			f = f.concat(fol);
	 		});
	 		fn(null, f);
	 	}
	 );	
}
function getFollowing(u, fn){
	var followers = [];
	var t = 0;
	async.doWhilst(
		function g(done){ 
			_log('getting following ' + (++t));
			var q = {};
			if(cursor){
				q.cursor = cursor;
			}
			$.getJSON('/'+u+'/following/users', q, function(res){
				cursor = res.cursor == "0" ? void 0 : res.cursor;
				followers.push(res.items_html);
				done();
			});
		},
		function test(){
			return cursor != undefined;
		},
	 	function(){
	 		var f =[];
	 		cleanFollowers(followers).forEach(function(fol){
	 			f = f.concat(fol);
	 		});
	 		fn(null, f);
	 	}
	 );	
}

function cleanTweets(tweets){
	var html = tweets.join('');
	html = $('<div>'+html+'</div>');
	var t = html.find(".ProfileTweet-text").map(function(){return $(this).text()}).toArray()
	return t;
}
function cleanFollowers(followers){
	var html = followers.join('');
	html = $('<div>'+html+'</div>');
	var u = html.find('.u-linkComplex-target').map(function(){
		return $(this).text();
	}).toArray();
	return u;
}

function tweet (t, fn) {
	$.post('/i/tweet/create',{
		status:t, 
		authenticity_token:$("input[name='authenticity_token']").val()
	}).always(fn);
}
function block (u, fn) {
	store.sadd('blocked', u);
	$.post('/i/user/block',{
		block_user:'true',
		authenticity_token:$("input[name='authenticity_token']").val(),
		screen_name:u
	}).always(fn);
}

function isBlocked (u) {
	return store.sismember('blocked', u);
}

function me(){
	return JSON.parse($("#init-data").val()).screenName;
}
function myAccounts(){
	return store.keys().filter(function (f) {
		return f.indexOf('myaccount') != -1;
	})
}

$(function(){
	$("body").on('click','#__blockall', function(){
		async.waterfall([
			function doblock (fn) {
				async.eachLimit(store.smembers('blocklist:users'),10, function(u, done){
					if(isBlocked(u)){
						$('[_block_user="'+u+'"]').remove();
						return done();
					}
					block(u, function(){
						_log('blocked @' + u);
						$('._block_user[user="'+u+'"]').remove();
						done();
					})
				})
			}
		]);
	})
	$("body").on('click','#_start', function(){
		async.waterfall([
			function get(fn){		
				 var u = $("#_username").val();
				 if(!u || u==""){
				 	return alert('invalid username');
				 }
				if(u.indexOf("@") == 0){
					u = u.replace('@','');
				}
				_log('getting followers of ' + u);
				getFollowers(u, fn);
			},
			function prepareTweets(followers, fn){
				_log('got '+ followers.length + ' users');
				_log('preparing tweets');
				var msg = $("#_msg").val() + "\n\n";
				var tweets = [];
				var i=0;
				while(followers.length){
					var m = new String(msg);
					while(m.length < 140 && followers.length){
						var f = "@" + followers[0];
						var _m = m + " " + f;
						if(_m.length > 140){
							break;
						}else{
							m = _m;
							followers.shift();
						}
					}

					tweets.push(m);
					_log('tweet #' + (++i) + " > " +m);
				}
				fn(null, tweets);
			},
			function send(tweets, fn){
				var i=0;
				async.eachSeries(tweets, function send(t, done){
					_log('tweeting #' + (++i) + " > " +t);
					tweet(t, function(){
						done();
					});
				}, fn)
			}
		], function(err){
			if(err){
				return _log('ERROR ' + err);
			}
		});
	});
	$('body').on('click', '#_menu span', function(){
		var self = $(this);
		$("#_menu span").removeClass('active');
		self.addClass('active');
		var type = self.attr('data-type');
		var html = "";
		if(type == 'block list'){
			var users = store.smembers('blocklist:users').map(function(u){
				if(isBlocked(u)){
					return '';
				}
				return '<h6 class="_block_user" user="'+u+'">@'+u+'</h6>';
			});
			html = users.join('');
			html = html + '<h2>'+store.smembers('blocklist:users').length+' in blocklist, '+store.smembers('blocked').length+' blocked</h2>';
			html = html + '<hr /><button type="button" id="__blockall">Block All!</button>';
		}
		if(type == 'backup'){
			var acc = myAccounts();
			acc = acc.map(function(a){return a.replace('myaccount:','');});
			html = jade.render('backup',{my_accounts:acc});
		}
		$("#_contents").html(html);
	});
	$("body").on('click', '.save-data', function(){
		var download = $(this).hasClass('save-computer');
		async.waterfall([
			function followers(fn){
				getFollowers(me(), fn);
			},
			function following(followers, fn){
				getFollowers(me(), function(err, f){
					fn(null, f, followers);
				});
			},
			function save(following,followers, fn){
				_log('making local backup');
				var list = {};
				list.following = following;
				list.followers = followers;
				JSON.stringify(list);
				store.set('myaccount:'+me(), list);
				fn();
			}
		], function(err){
			if(err){
				return _log(err);
			};
			if(download){
				backupAccount();
			}
		})
	});
});

function msgHasRoomForMore(msg, u){
	return (msg +' ' + u).length < 140;
}

function backupAccount(){
	var d = store.get('myaccount:' + me());
	downloadJSON(d, 'data.'+me());
}

function downloadJSON (data, fname) {
	//ref http://stackoverflow.com/questions/17836273/export-javascript-data-to-csv-file-without-server-interaction
	var data = JSON.stringify(data, false, 3)
	var a         = document.createElement('a');
	a.href        = 'data:attachment/json;charset=utf-8,' + encodeURIComponent(data);
	a.target      = '_blank';
	a.download    = fname + '.json';
	document.body.appendChild(a);
	a.click();
}