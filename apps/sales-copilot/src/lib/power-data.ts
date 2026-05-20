/**
 * Power Apps Data Client wrapper.
 *
 * Uses the pac-CLI-generated DataSourcesInfo from .power/schemas/.
 * Services must pass the entitySetName (e.g. 'crf5c_contacts') as the
 * data source name — this matches power.config.json dataSources keys.
 */

import {
  getClient as sdkGetClient,
  type DataClient,
} from '@microsoft/power-apps/data';
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo';

let _client: DataClient | null = null;

/**
 * Get a singleton DataClient instance.
 * Drop-in replacement for the old shim's `getClient()`.
 */
export function getClient(): DataClient {
  if (!_client) {
    _client = sdkGetClient(dataSourcesInfo);
  }
  return _client;
}
