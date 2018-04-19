'use strict';

const signinHandler = require('../authentication/lib/handlers/signinHandler');
const callbackHandler = require('../authentication/lib/handlers/callbackHandler');
const refreshHandler = require('../authentication/lib/handlers/refreshHandler');
const nock = require('nock');
const { expect } = require('chai');
const url = require('url');
const defaultEvent = require('./event.json');
const { utils, config } = require('serverless-authentication');

describe('Authentication Provider', () => {
  before(() => {
    const providerConfig = config(Object.assign({}, defaultEvent, { provider: 'custom-google' }));
    const payload = {
      client_id: providerConfig.id,
      redirect_uri: providerConfig.redirect_uri,
      client_secret: providerConfig.secret,
      code: 'code',
      grant_type: 'authorization_code'
    };

    nock('https://www.googleapis.com')
      .post(
        '/oauth2/v4/token',
        Object.keys(payload).reduce((result, key) =>
          result.concat(`${key}=${encodeURIComponent(payload[key])}`), []).join('&')
      )
      .reply(200, {
        access_token: 'access-token-123'
      });

    nock('https://www.googleapis.com')
      .get('/plus/v1/people/me')
      .query({ access_token: 'access-token-123' })
      .reply(200, {
        id: 'user-id-1',
        displayName: 'Eetu Tuomala',
        emails: [
          {
            value: 'email@test.com'
          }
        ],
        image: {
          url: 'https://avatars3.githubusercontent.com/u/4726921?v=3&s=460'
        }
      });
  });

  describe('Custom Google', () => {
    let state = '';
    let refreshToken = '';
    it('should return oauth signin url', (done) => {
      const event = Object.assign({}, defaultEvent, {
        pathParameters: {
          provider: 'custom-google'
        }
      });

      signinHandler(event, {
        succeed: (data) => {
          expect(data.statusCode).to.equal(302);
          const { query } = url.parse(data.headers.Location, true);
          const queryState = query.state;
          state = queryState;
          expect(data.headers.Location).to.match(/https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?client_id=cg-mock-id&redirect_uri=https:\/\/api-id\.execute-api\.eu-west-1\.amazonaws\.com\/dev\/authentication\/callback\/custom-google&response_type=code&scope=profile email&state=.{64}/);
          done(null);
        }
      });
    });

    it('should return local client url', (done) => {
      const event = Object.assign({}, defaultEvent, {
        pathParameters: {
          provider: 'custom-google'
        },
        queryStringParameters: {
          code: 'code',
          state
        }
      });

      const providerConfig = config(event);
      callbackHandler(event, {
        succeed: (data) => {
          expect(data.statusCode).to.equal(302);
          const { query } = url.parse(data.headers.Location, true);
          refreshToken = query.refresh_token;
          expect(query.authorization_token).to.match(/[a-zA-Z0-9\-_]+?\.[a-zA-Z0-9\-_]+?\.([a-zA-Z0-9\-_]+)?/);
          expect(refreshToken).to.match(/[A-Fa-f0-9]{64}/);
          const tokenData = utils.readToken(query.authorization_token, providerConfig.token_secret);
          expect(tokenData.id)
            .to.equal('46344f93c18d9b70ddef7cc5c24886451a0af124f74d84a0c89387b5f7c70ff4');
          done(null);
        }
      });
    });

    it('should get new authorization token', (done) => {
      const event = {
        refresh_token: refreshToken,
        stage: 'dev'
      };

      refreshHandler(event, (error, data) => {
        expect(error).to.be.null;
        expect(data.authorization_token).to.match(/[a-zA-Z0-9\-_]+?\.[a-zA-Z0-9\-_]+?\.([a-zA-Z0-9\-_]+)?/);
        expect(data.refresh_token).to.match(/[A-Fa-f0-9]{64}/);
        done(error);
      });
    });
  });
});