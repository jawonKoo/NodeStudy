var express = require('express');
var connect = require('connect');
var fortune = require('./lib/fortune.js');
var formidable = require('formidable');
var credentials = require('./credentials.js');
var jqupload = require('jquery-file-upload-middleware');

var app = express();

var VALID_EMAIL_REGEX = new RegExp(
    '^[a-zA-Z0-9.!#$%&\'*+\/=?^_`{|}~-]+@' +
    '[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?' +
    '(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$'
);

var emailService = require('./lib/email.js')(credentials);

var handlebars = require('express-handlebars').create({
    defaultLayout:'main',
    helpers: {
        section: function(name, options){
            if(!this._sections) this._sections = {};
            this._sections[name] = options.fn(this);
            return null;
        }
    }

});

app.engine('handlebars', handlebars.engine);
app.set('view engine', 'handlebars');

app.set('port', process.env.PORT || 3000);

switch (app.get('env')) {
    case 'development':
        app.use(require('morgan')('dev'));
        break;
    case 'production':
        app.use(require('express-logger')({
            path: __dirname + '/log/requests.log'
        }));
        break;
    default:

}

app.use(express.static(__dirname + '/public'));

app.use(require('body-parser').urlencoded({ extneded: true }));

app.use(require('cookie-parser')(credentials.cookieSecret));

app.use(require('express-session')({
    resave: false,
    saveUninitialized: false,
    secret: credentials.cookieSecret
}));

app.use(function(req, res, next){
    res.locals.showTests = app.get('env') !== 'production' && req.query.test === '1';
    next();
});

app.use(function(req, res, next){
    if(!res.locals.partials) res.locals.partials = {};
    res.locals.partials.weatherContext = getWeatherData();
    next();
});

app.use(function(req, res, next){
    //플래시 메세지가 있다면 콘텍스트에 전달한 다음 지웁니다.
    res.locals.flash = req.session.flash;
    delete req.session.flash;
    next();
});

app.use(function(req, res, next){
    req.session.cart = {};
    next();
});

app.use('/upload', function(req, res, next){
    var now = Date.now();
    jqupload.fileHandler({
        uploadDir: function(){
            return __dirname + '/public/uploads/' + now;
        },
        uploadUrl: function(){
            return '/uploads/' + now;
        },
    })(req, res, next);
});


app.get('/', function(req, res){

    res.render('home');
});

app.get('/about', function(req, res){
    res.render('about', {
            fortune: fortune.getFortune(),
            pageTestScript: 'qa/tests-about.js'
        });
});

app.get('/jquery-test', function(req, res){
    res.render('jquery-test');
});

app.get('/nursery-rhyme', function(req, res){
    res.render('nursery-rhyme');
});

app.get('/data/nursery-rhyme', function(req, res){
    res.json({
        animal: 'squirrel',
        bodyPart: 'tail',
        adjective: 'bushy',
        noun: 'heck',
    });
});

app.get('/tours/hood-river', function(req, res){
    res.render('tours/hood-river');
});

app.get('/tours/request-group-rate', function(req, res){
    res.render('tours/request-group-rate');
});

app.get('/newsletter', function(req, res){
    res.render('newsletter', {csrf: 'CSRF token goes here'});
});

app.post('/newsletter', function(req, res){
    var name = req.body.name || '', email = req.body.email || '';
    //입력 유효성 검사
    if(!email.match(VALID_EMAIL_REGEX)) {
        if(req.xhr) return res.json({error: 'Invalid name email address.'});
        req.session.flash = {
            type: 'danger',
            intro: 'Validation error!',
            message: 'The email address you entered was not valid.',
        };
        return res.redirect(303, '/newsletter/archive');
    }

    new NewsletterSignup({ name: name, email: email}).save(function(err){
        if(err) {
            if(req.xhr) return res.json({ error: 'Database error.'});
            req.sesstion.flash = {
                type: 'danger',
                intro: 'Database error!',
                message: 'There was a database error; please try agin later.',
            };
            return res.redirect(303, '/newsletter/archive');
        }
        if(req.xhr) return res.json({ success: true});
        req.session.flash = {
            type: 'success',
            intro: 'Thank you!',
            message: 'You have now been signed up for the newsletter.',
        };
        return res.redirect(303, '/newsletter/archive');
    });
});

app.post('/process', function(req, res){
    /*
    console.log('Form (from querystring): ' + req.query.form);
    console.log('CSRF token (from hidden from field): ' + req.body._csrf);
    console.log('Name (from visible form field): ' + req.body.name);
    console.log('Email (from visible form field): ' + req.body.email);
    */
    if(req.xhr || req.accepts('json,html')==='json'){
        res.send({success: true});
        // (에러가 있다면 { error: 'error description' }을 보냅니다)
    } else {
        res.redirect(303, '/thank-you');
        // (에러가 있다면 에러 페이지로 리다이렉트합니다.)
    }
});

app.get('/contest/vacation-photo', function(req, res){
    var now = new Date();
    res.render('contest/vacation-photo', {
        year: now.getFullYear(), month: now.getMonth()
    });
});

app.post('/contest/vacation-photo/:year/:month', function(req, res){
    var form = new formidable.IncomingForm();
    form.parse(req, function(err, fields, files){
        if(err) return res.redirect(303, '/error');
        console.log('received fields:');
        console.log(fields);
        console.log('received files:');
        console.log(files);
        res.redirect(303, '/thank-you');
    });
});

app.get('/cart/checkout', function(req, res, next){
    var cart = req.session.cart;
    if(!cart) next();
    res.render('cart-checkout');
});

app.post('/cart/checkout', function(req, res, next){
    var cart = req.session.cart;
    if(!cart) next(new Error('Cart does not exist.'));
    var name = req.body.name || '', email = req.body.email || '';
    //유효성 검사
    if(!email.match(VALID_EMAIL_REGEX)){
        return res.next(new Error('Invailid email address.'));
    }
    //랜덤한 장바구니 ID를 부여합니다. 실무라면 데이터베이스 ID를 썼을 겁니다.
    cart.number = Math.random().toString().replace(/^0\.0*/, '');
    cart.billing = {
        name: name,
        email: email,
    };
    res.render('email/cart-thank-you',
        { layout: null, cart: cart }, function(err,html){
            if(err) console.log('error in email template');
            emailService.send(cart.billing.email, 'Thank you for Book your Trip with Meadowlark', html);
        }
    );
    res.render('cart-thank-you', { cart:cart });
});


//커스텀 404페이지
app.use(function(req, res){
  res.status(404);
  res.render('404');
});

//커스텀 500페이지
app.use(function(err, req, res, next){
  console.error(err.stack);
  res.status(500);
  res.render('500');
});

function startServer(){
    app.listen(app.get('port'), function(){
      console.log( 'Express started in ' + app.get('env') +
        ' mode on http://kooserver.iptime.org:' + app.get('port') +
        '; press Ctrl + C to terminate.');
    });
}

if(require.main === module){
    startServer();
} else {
    // require를 통해 애플리케이션을 모듈처럼 가져옵니다.
    // 함수를 반환해서 서버를 생성합니다.
    module.exports = startServer;
}


function NewsletterSignup(data){

    function save(callback){
        if(typeof callback === "function"){
            callback(false);
        }
    }

    return {
        save : save,
    };
}

function getWeatherData(){
    return {
        locations: [
            {
                name: 'Protland',
                forecastUrl: 'http://www.wunderground.com/US/OR/Portland.html',
                iconUrl: 'http://icons-ak.wxug.com/i/c/k/cloudy.gif',
                weather: 'Overcast',
                temp: '54.1 F (12.3 C)',
            },
            {
                name: 'Bend',
                forecastUrl: 'http://www.wunderground.com/US/OR/Bend.html',
                iconUrl: 'http://icons-ak.wxug.com/i/c/k/partlycloudy.gif',
                weather: 'Partly Cloudy',
                temp: '55.0 F (12.8 C)',
            },
            {
                name: 'Manzanita',
                forecastUrl: 'http://www.wunderground.com/US/OR/Manzanita.html',
                iconUrl: 'http://icons-ak.wxug.com/i/c/k/rain.gif',
                weather: 'Light Rain',
                temp: '55.0 F (12.8 C)',
            },
        ]
    };
}
