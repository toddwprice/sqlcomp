const commander = require('commander');
const pkg = require('./package.json');
const sqlcomp = require('./sqlcomp');
const fs = require('fs-extra');

const validateSpec = (spec) => {
  if (!spec.driver) return new Error('Spec is missing `driver`');
  if (!spec.user) return new Error('Spec is missing `user`');
  if (!spec.password) return new Error('Spec is missing `password`');
  if (!spec.host) return new Error('Spec is missing `host`');
  if (!spec.database) return new Error('Spec is missing `database`');
  if (!spec.port) return new Error('Spec is missing `port`');
  return null;
};

commander
  .version(pkg.version)
  .arguments('<file> <db1> <db2>')
  .action(async (filespec, db1, db2) => {
    if(!fs.existsSync(filespec)) {
      console.log('No databases.json file found at:', filespec);
      process.exit(1);
    }
    let databases;
    try {
      databases = require(filespec);

      if (!databases[db1]) {
        console.log('Spec not found:', db1);
        process.exit(1);
      }

      if (!databases[db2]) {
        console.log('Spec not found:', db2);
        process.exit(1);
      }

      let db1Error = validateSpec(databases[db1]);
      if (db1Error) {
        console.log(db1Error);
        process.exit(1);
      }

      let db2Error = validateSpec(databases[db2]);
      if (db2Error) {
        console.log(db2Error);
        process.exit(1);
      }


      let result = await sqlcomp(databases, db1, db2);
      if (result) {
        console.log(result);
        process.exit(1);
      }
      else {
        console.log('SUCCESS');
        process.exit(0);
      }
    }
    catch (err) {
      console.log('Not a valid JSON file:', filespec);
      process.exit(1);
    }
  })
  // .option('-f, --file <value>', 'Path to databases.json file')
  // .option('-1, --db1 <value>', 'The name of the first database in the databases.json file')
  // .option('-2, --db2 <value>', 'The name of the first database in the databases.json file')
  .parse(process.argv);

