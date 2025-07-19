import yaml from 'yamljs';
const swaggerDocument = yaml.load('./swagger/swagger.yaml');
export default swaggerDocument;
