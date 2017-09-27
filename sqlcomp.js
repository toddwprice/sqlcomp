'use strict';

const mysql = require('mysql');
const util = require('util');
const fs = require('fs');
const reportIdentical = true;
const chalk = require('chalk');
const Handlebars = require('handlebars');
const open = require('open');

const DEBUG_LEVELS = {
  NONE: 0,
  INFO: 1,
  DEBUG: 2,
  VERBOSE: 3
};
const DEBUG_LEVEL = DEBUG_LEVELS.DEBUG;
const SKIP_PROPS = ['TABLE_SCHEMA', 'ORDINAL_POSITION'];
const DIFF_OUTCOMES = {
  SAME: 'identical',
  A_NOT_B: 'left-only',
  B_NOT_A: 'right-only',
  DIFFERENT: 'different'
};
const REPORT_TYPES = {
  CONSOLE: 1,
  HTML: 2,
  DISK: 3
};
const REPORT_TYPE = REPORT_TYPES.HTML;
const REPORT_ONLY = false;

let report = {
  db1Name: null,
  db2Name: null,
  tables: [
    // {name: 'foo', outcome: 2, columnDiffs: []}
  ]
};

let query = async (conn, sql, params) => {
  if (DEBUG_LEVEL >= 3) console.log(`executing sql: ${sql}`, params);
  return new Promise((resolve, reject) => {
    conn.query(sql, params, (error, results, fields) => {
      if (error) return reject(error);
      return resolve(results);
    });
  });
};

const compare = async (db1, db2) => {
  // get tables
  const connection1 = mysql.createConnection({
    host     : db1.host,
    user     : db1.user,
    password : db1.password
  });

  const connection2 = mysql.createConnection({
    host     : db2.host,
    user     : db2.user,
    password : db2.password
  });  

  if (REPORT_ONLY) {
    report = require('./report.json');
    return;
  }

  let tableSql = 'select * from information_schema.tables where TABLE_SCHEMA = ?'
  let db1Tables = await query(connection1, tableSql, [db1.database]);
  let db2Tables = await query(connection2, tableSql, [db2.database]);
  let colSql = 'select * from information_schema.columns where TABLE_SCHEMA = ?'
  let db1Cols = await query(connection1, colSql, [db1.database]);
  let db2Cols = await query(connection2, colSql, [db2.database]);

  const compareCols = async (tableName) => {
    // compare columns
    let db1TableCols = db1Cols.filter(val => { return val.TABLE_NAME == tableName});
    let db2TableCols = db2Cols.filter(val => { return val.TABLE_NAME == tableName});
  
    let reportTable = {name: tableName, outcome: null, columnDiffs: []};
    
    for (let col1 of db1TableCols) {
      if (DEBUG_LEVEL >= 3) console.log(`comparing ${tableName}.${col1.COLUMN_NAME}`);
      let col2 = db2TableCols.filter(val => { return val.COLUMN_NAME == col1.COLUMN_NAME});
      if (col2.length == 0) {
        if (!reportTable.outcome) reportTable.outcome = DIFF_OUTCOMES.DIFFERENT;
        reportTable.columnDiffs.push({columnName: col1.COLUMN_NAME, outcome: DIFF_OUTCOMES.A_NOT_B});
      }
      else {
        // compare properties of each column
        for (let prop of Object.keys(col1)) {
          if (SKIP_PROPS.indexOf(prop) == -1 && col1[prop] != col2[0][prop]) {
            if (!reportTable.outcome) reportTable.outcome = DIFF_OUTCOMES.DIFFERENT;
            reportTable.columnDiffs.push({
              columnName: col1.COLUMN_NAME, 
              outcome: DIFF_OUTCOMES.DIFFERENT, 
              property: prop, 
              value1: col1[prop], 
              value2: col2[0][prop],
              db1Name: db1Name, 
              db2Name: db2Name
            });
            // console.log(`${col1.COLUMN_NAME}.${prop} == ${col1[prop]} but ${col2[0].COLUMN_NAME}.${prop} == ${col2[0][prop]}`);
          }
        }
      }
    }
  
    if (!reportTable.outcome) reportTable.outcome = DIFF_OUTCOMES.SAME;
    report.tables.push(reportTable);
  
    return;
  };

  for (let table of db1Tables) {
    let existsInDb2 = db2Tables.filter(val => { return val.TABLE_NAME == table.TABLE_NAME }).length == 1;
    if (!existsInDb2) {
      // console.log(`table ${table.TABLE_NAME} exists in ${db1Name} but not in ${db2Name}`);
      report.tables.push({name: table.TABLE_NAME, outcome: DIFF_OUTCOMES.A_NOT_B});
    }
    else {
      await compareCols(table.TABLE_NAME);
    }
  }

  for (let table of db2Tables) {
    let existsInDb1 = db1Tables.filter(val => { return val.TABLE_NAME == table.TABLE_NAME }).length == 1;
    if (!existsInDb1) {
      // console.log(`table ${table.TABLE_NAME} exists in ${db2Name} but not in ${db1Name}`);
      report.tables.push({name: table.TABLE_NAME, outcome: DIFF_OUTCOMES.B_NOT_A});
    }
  }
};

const outputReport = async (db1, db2) => {
  report.db1Name = db1;
  report.db2Name = db2;

  if (REPORT_TYPE == REPORT_TYPES.DISK) {
    fs.writeFileSync('report.json', JSON.stringify(report, null, 2), {encoding: 'utf-8'});
    console.log('Report written to: report.json');
  }

  if (REPORT_TYPE == REPORT_TYPES.CONSOLE) {
    let tables = report.tables;
    for (let table of tables) {
      if (table.outcome == DIFF_OUTCOMES.SAME && reportIdentical) {
        console.log(chalk.white.bgGreen(DIFF_OUTCOMES.SAME + ': ' + table.name));
      }
      else if (table.outcome == DIFF_OUTCOMES.A_NOT_B) {
        console.log(chalk.white.bgBlue(DIFF_OUTCOMES.A_NOT_B + ': ' + table.name));
      }
      else if (table.outcome == DIFF_OUTCOMES.B_NOT_A) {
        console.log(chalk.white.bgRed(DIFF_OUTCOMES.B_NOT_A + ': ' + table.name));
      }
      else if (table.outcome == DIFF_OUTCOMES.DIFFERENT) {
        console.log(chalk.white.bgYellow.bold(DIFF_OUTCOMES.DIFFERENT + ': ' + table.name));
        for (let col of table.columnDiffs) {
          if (col.outcome == DIFF_OUTCOMES.A_NOT_B) {
            console.log(chalk.blue(`    ${col.columnName} ` + chalk.bold(col.outcome)));
          }
          else {
            console.log(chalk.red(`    ${col.columnName} ${col.outcome}: ${col.property} ${col.value1} --> ${col.value2}`));
          }
        }
      }
    }    
  }  

  if (REPORT_TYPE == REPORT_TYPES.HTML) {
    let compiled = Handlebars.compile(fs.readFileSync('report.hbs', {encoding: 'utf-8'}));
    let html = compiled(report);
    let filespec = 'report.html';
    fs.writeFileSync(filespec, html, {encoding: 'utf-8'});
    open('report.html');
  }
};

module.exports = async (databases, db1, db2) => {
  try {
    await compare(databases[db1], databases[db2]);
    await outputReport(db1, db2);
    return null;
  }
  catch(err) {
    return err;
  }
}
