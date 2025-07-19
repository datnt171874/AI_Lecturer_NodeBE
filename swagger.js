const yaml = require('yamljs');
const swaggerDocument = yaml.load('./swagger/swagger.yaml');
// console.log(swaggerDocument);
module.exports = swaggerDocument;
