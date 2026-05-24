/**
 * __mocks__/africastalking.js
 *
 * Root-level Jest manual mock for the africa's talking SDK.
 * Allows smsGateway.test.js to import the backend gateway without the actual
 * package being installed in the root node_modules (it lives in backend/node_modules).
 */

const mockSend = jest.fn().mockResolvedValue({
  SMSMessageData: { Message: 'Sent to 1/1 Total Cost: KES 1' },
  Recipients: [{ number: '+254712345678', status: 'Success', cost: 'KES 1', messageId: 'mock-id-001' }],
});

const mockAT = jest.fn(() => ({
  SMS:  { send: mockSend },
  USSD: {},
}));

// Expose the inner mock so tests can assert on it if needed
mockAT._mockSend = mockSend;

module.exports = mockAT;
