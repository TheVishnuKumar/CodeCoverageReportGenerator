const express = require('express');
var jsforce = require('jsforce');
var session = require('express-session')
const app = new express();
var redirectUri;
var clientId;
var clientSecret;
const PORT = process.env.PORT || 4444;

app.set('view engine', 'ejs');
app.use(express.static(__dirname + '/public'));

var sess = {
    secret: 'keyboard cat',
    cookie: {}
}
   
if (app.get('env') === 'production') {
    app.set('trust proxy', 1) // trust first proxy
    sess.cookie.secure = true // serve secure cookies

    redirectUri = process.env.redirectUri;
    clientId = process.env.clientId;
    clientSecret = process.env.clientSecret;
}
else{
    redirectUri = 'http://localhost:4444/callback';
    clientId = '3MVG9ZL0ppGP5UrCCqT.fLO5GU_630R_y3w6ui8SdXejhiIWGD11M8OcN95pM7199CJ0L0ZkeLDGF50b.zSSG';
    clientSecret = '3708501846806616073';
}

app.use(session(sess));

//Login/Landing Page
app.get('/', function(req, res) {
    if ( typeof req.session.instanceUrl != 'undefined' ) {
        fetchTestCoverage(req, function(response){
            if ( typeof req.query.export == 'undefined' ){
                res.render('pages/CoverageResult', { results : response, isLoggedIn: true,instanceUrl:req.session.instanceUrl });
            }else{
                res.statusCode = 200;
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-disposition', 'attachment; filename=Code Coverage Report.csv');
                
                var headers = ['Index','Class/Trigger Name','Lines','Coverage'];
                var row = [];
                row.push(headers);
                
                for( var i=0; i<response.length; i++){
                    var column = [];
                    column.push(i+1);
                    column.push(response[i].ApexClassOrTrigger.Name);
                    
                    response[i].NumLinesUncovered = response[i].NumLinesUncovered != null ? response[i].NumLinesUncovered : 0;
                    column.push(response[i].NumLinesCovered + '/' +response[i].NumLinesUncovered );

                    var Percent = ((response[i].NumLinesCovered / (response[i].NumLinesCovered + response[i].NumLinesUncovered) ) * 100).toFixed(0);
                    if( isNaN(Percent) ){
                        Percent = 0;
                    }
                    column.push(Percent+'%');
                    row.push(column);
                }
                
                row.forEach(function(row) {
                    res.write(row.map(function(field) {
                      return '"' + field.toString().replace(/\"/g, '""') + '"';
                    }).toString() + '\r\n');
                });
                
                res.end();
            }
        });
    }
    else{
        res.render('pages/login',{isLoggedIn: false});
    }
});

//Redirecting to Generate Outh acccess token
app.get('/oauth2/auth', function(req, res) {
    req.session.loginUrl = req.query.instance;
    var oauth2 = new jsforce.OAuth2({
        loginUrl : req.query.instance,
        clientId : clientId,
        clientSecret : clientSecret,
        redirectUri : redirectUri
    });
    res.redirect(oauth2.getAuthorizationUrl({ scope : 'full refresh_token' }));
});

//It will be called after salesforce login as the callback and set the session
app.get('/callback', function(req, res) {
    var code = req.param('code');
    var oauth2 = new jsforce.OAuth2({
        loginUrl : req.session.loginUrl,
        clientId : clientId,
        clientSecret : clientSecret,
        redirectUri : redirectUri
    });


    var conn = new jsforce.Connection({ oauth2 : oauth2 });
    conn.authorize(code, function(err, userInfo) {
        if (err) { return console.error(err); }
        req.session.instanceUrl = conn.instanceUrl;
        req.session.accessToken = conn.accessToken;
        req.session.refreshToken = conn.refreshToken;

        res.redirect('/');
    });    
});

app.get('/logout', function(req, res) {
    req.session.destroy();
    res.redirect('/');
});

app.listen(PORT,()=>{});

function fetchTestCoverage(req, callback){
    var conn = new jsforce.Connection({
        oauth2 : {
          clientId : clientId,
          clientSecret : clientSecret,
          redirectUri : redirectUri
        },
        instanceUrl : req.session.instanceUrl,
        accessToken : req.session.accessToken,
        refreshToken : req.session.refreshToken
    });

    conn.on("refresh", function(accessToken, res) {
        req.session.accessToken = accessToken;
    });
    
    var sortColumn = 'ApexClassOrTrigger.Name';
    var sortOrder = 'ASC';

    conn.tooling.query('SELECT Id,ApexClassOrTrigger.Name, NumLinesCovered, NumLinesUncovered,ApexClassorTriggerId FROM ApexCodeCoverageAggregate ORDER BY '+sortColumn+' '+sortOrder, function(err, result) {
        if (err) { return console.error(err); }
        return callback(result.records);
    });
}