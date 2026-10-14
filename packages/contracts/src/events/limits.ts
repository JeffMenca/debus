// The largest quetzal amount any event carries. The API of a producer stops at this same figure,
// so an amount it accepts can never break the contract of the event it publishes.
export const EVENT_AMOUNT_MAX = 1_000_000;
