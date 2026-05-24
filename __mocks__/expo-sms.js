module.exports = {
  isAvailableAsync: jest.fn(async () => true),
  sendSMSAsync: jest.fn(async () => ({ result: 'sent' })),
};
