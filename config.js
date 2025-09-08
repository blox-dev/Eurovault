// config.js
const env = process.env.NODE_ENV || 'dev';

const configs = {
  dev: {
    PORT: 3000,
    METADATA_FILE: 'metadata.json',
    DATA_FOLDER: 'data',
    FILES_FOLDER: 'data/files',
    PUBLIC_FOLDER: 'public',
    BASE_URL: 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data',
  },
  test: {
    PORT: 0,
    METADATA_FILE: 'metadata.test.json',
    DATA_FOLDER: 'data_test',
    FILES_FOLDER: 'data_test/files',
    PUBLIC_FOLDER: 'public',
    BASE_URL: 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data',
  },
};

export const config = configs[env];