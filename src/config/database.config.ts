export interface DatabaseConfig {
  host: string;
  user: string;
  password: string;
  database: string;
  port: number;
  ssl: {
    rejectUnauthorized: boolean;
  };
}

export const databaseConfig: DatabaseConfig = {
  host: 'postgresql.clo0guy8qloj.ap-northeast-2.rds.amazonaws.com',
  user: 'admin1234',
  password: 'Admin1234!',
  database: 'postgres',
  port: 5432,
  ssl: {
    rejectUnauthorized: false
  }
};