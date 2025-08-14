#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { parseArgs } from 'node:util';
import packageJson from '../../package.json' with { type: 'json' };
import { createSupabaseApiPlatform } from '../platform/api-platform.js';
import { createSelfHostedPlatform } from '../platform/self-hosted-platform.js';
import { createSupabaseMcpServer } from '../server.js';
import { parseList } from './util.js';

const { version } = packageJson;

async function main() {
  const {
    values: {
      ['access-token']: cliAccessToken,
      ['project-ref']: projectId,
      ['read-only']: readOnly,
      ['api-url']: apiUrl,
      ['version']: showVersion,
      ['features']: cliFeatures,
      ['self-hosted']: selfHosted,
      ['host-url']: hostUrl,
      ['service-role-key']: serviceRoleKey,
      ['pg-connection']: pgConnection,
    },
  } = parseArgs({
    options: {
      ['access-token']: {
        type: 'string',
      },
      ['project-ref']: {
        type: 'string',
      },
      ['read-only']: {
        type: 'boolean',
        default: false,
      },
      ['api-url']: {
        type: 'string',
      },
      ['version']: {
        type: 'boolean',
      },
      ['features']: {
        type: 'string',
      },
      ['self-hosted']: {
        type: 'boolean',
        default: false,
      },
      ['host-url']: {
        type: 'string',
      },
      ['service-role-key']: {
        type: 'string',
      },
      ['pg-connection']: {
        type: 'string',
      },
    },
  });

  if (showVersion) {
    console.log(version);
    process.exit(0);
  }

  let platform;

  if (selfHosted) {
    // For self-hosted instances, we need either host URL and service role key
    if (!hostUrl) {
      console.error('Please provide a host URL with the --host-url flag when using --self-hosted');
      process.exit(1);
    }
    
    if (!serviceRoleKey) {
      console.error('Please provide a service role key with the --service-role-key flag when using --self-hosted');
      process.exit(1);
    }

    platform = createSelfHostedPlatform({
      hostUrl,
      serviceRoleKey,
      pgConnection,
    });
  } else {
    // Cloud Supabase instances require an access token
    const accessToken = cliAccessToken ?? process.env.SUPABASE_ACCESS_TOKEN;

    if (!accessToken) {
      console.error(
        'Please provide a personal access token (PAT) with the --access-token flag or set the SUPABASE_ACCESS_TOKEN environment variable'
      );
      process.exit(1);
    }

    platform = createSupabaseApiPlatform({
      accessToken,
      apiUrl,
    });
  }

  const features = cliFeatures ? parseList(cliFeatures) : undefined;

  const server = createSupabaseMcpServer({
    platform,
    projectId,
    readOnly,
    features,
  });

  const transport = new StdioServerTransport();

  await server.connect(transport);
}

main().catch(console.error);
