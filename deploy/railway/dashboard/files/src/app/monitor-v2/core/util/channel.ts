import { TdChannelName } from '../models/tiledesk.models';
import { ChannelCapabilities, ChannelKind } from '../models/view-models';

const IMG = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const DOC = ['application/pdf', 'application/msword', 'text/plain'];

/** Maps `request.channel.name` to what the composer needs to control a reply (improvement I-7). */
export function channelCapabilities(name: TdChannelName | string): ChannelCapabilities {
  switch (name) {
    case 'whatsapp':
      return cap('whatsapp', name, { maxLength: 4096, maxButtons: 3, maxButtonLength: 20, hasServiceWindow: true, supportsReplyTo: true, supportsReactions: true, supportsDelete: true, acceptedMimeTypes: [...IMG, ...DOC, 'audio/ogg'], maxFileSizeMb: 16 });
    case 'messenger':
      return cap('messenger', name, { maxLength: 2000, maxButtons: 3, maxButtonLength: 20, hasServiceWindow: true, supportsReactions: true, acceptedMimeTypes: [...IMG, ...DOC], maxFileSizeMb: 25 });
    case 'instagram':
      return cap('instagram', name, { maxLength: 1000, maxButtons: 3, maxButtonLength: 20, hasServiceWindow: true, supportsReactions: true, acceptedMimeTypes: IMG, maxFileSizeMb: 8 });
    case 'telegram':
      return cap('telegram', name, { maxLength: 4096, maxButtons: 8, maxButtonLength: 64, supportsMarkdown: true, supportsReplyTo: true, supportsDelete: true, acceptedMimeTypes: [...IMG, ...DOC], maxFileSizeMb: 50 });
    case 'email':
      return cap('email', name, { maxLength: 20000, maxButtons: 0, maxButtonLength: 0, supportsMarkdown: true, enterSends: false, acceptedMimeTypes: [...IMG, ...DOC], maxFileSizeMb: 20 });
    case 'sms':
      return cap('sms', name, { maxLength: 640, maxButtons: 0, maxButtonLength: 0, smsSegmentLength: 70, acceptedMimeTypes: [], maxFileSizeMb: 0 });
    case 'voice':
      return cap('voice', name, { maxLength: 0, maxButtons: 0, maxButtonLength: 0, acceptedMimeTypes: [], maxFileSizeMb: 0 });
    case 'form':
      return cap('internal', name, { maxLength: 5000, maxButtons: 0, maxButtonLength: 0, supportsMarkdown: true, acceptedMimeTypes: [...IMG, ...DOC], maxFileSizeMb: 10 });
    default:
      // chat21 = the web widget (priority channel)
      return cap('web', 'chat21', { maxLength: 2000, maxButtons: 10, maxButtonLength: 40, supportsMarkdown: true, supportsReplyTo: true, supportsDelete: true, acceptedMimeTypes: [...IMG, ...DOC, 'audio/webm'], maxFileSizeMb: 10 });
  }
}

function cap(kind: ChannelKind, name: string, over: Partial<ChannelCapabilities>): ChannelCapabilities {
  return {
    kind,
    name,
    maxLength: 2000,
    maxButtons: 0,
    maxButtonLength: 0,
    supportsMarkdown: false,
    acceptedMimeTypes: [],
    maxFileSizeMb: 10,
    hasServiceWindow: false,
    supportsReactions: false,
    supportsReplyTo: false,
    supportsDelete: false,
    enterSends: true,
    ...over,
  };
}

/** Channels other than the web widget are conditional: shown only when the channel is connected. */
export const CONDITIONAL_CHANNELS: ChannelKind[] = ['whatsapp', 'messenger', 'instagram', 'telegram', 'email', 'sms', 'voice'];
