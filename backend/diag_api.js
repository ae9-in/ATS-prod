const http = require('http');

const options = {
    hostname: 'localhost',
    port: 4000,
    path: '/api/pipeline/stages?jobId=c78f1718-6ca0-437a-b2bf-0b5befe4a9ba',
    method: 'GET',
    headers: {
        'Content-Type': 'application/json'
    }
};

const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        console.log('STATUS:', res.statusCode);
        console.log('BODY:', data);
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.end();
