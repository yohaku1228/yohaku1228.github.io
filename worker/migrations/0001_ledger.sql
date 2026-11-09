create table if not exists household_ledger (
  id integer primary key check (id = 1),
  revision integer not null check (revision > 0),
  ledger text not null check (json_valid(ledger) and json_type(ledger) = 'object')
);

create table if not exists receipt_quota (
  day text primary key,
  calls integer not null check (calls between 1 and 15)
);
