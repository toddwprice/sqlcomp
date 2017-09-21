# sqlcomp
Compares MySQL databases using info in `information_schema` queries

## Usage
`sqlcomp /path/to/databases.json DB1 DB2`

- `databases.json` -- a file with the following format:
```
{
  "development": {
    "driver": "mysql",
    "user": "db_user",
    "password": "MY-DB-PASSWORD",
    "host": "127.0.0.1",
    "database": "mydb",
    "port": 3306
  },
  "staging": {
    "driver": "mysql",
    "user": "db_user",
    "password": "MY-DB-PASSWORD",
    "host": "99.88.77.66",
    "database": "mydb",
    "port": 3306
  }
}
```
- `DB1` -- the name of the first database to connect to for comparison
- `DB2` -- the name of the second database to connect to for comparison

Note that while the example above uses "development" and "staging", your file can have whatever names you like, with as many databases as you like.