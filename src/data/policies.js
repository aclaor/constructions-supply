// Starter policy text. Edit these to match how you actually ship and handle returns.
// {store} and {email} are filled in from Settings.
export const POLICIES = {
  shipping: {
    title: 'Shipping',
    body: [
      ['How orders ship', 'Orders are packed and sent directly from our supply partners\' warehouses. Most orders are handed to the carrier within 2 to 5 business days. Your tracking number appears on your order page as soon as the parcel is scanned.'],
      ['Delivery times', 'Delivery to US addresses usually takes 7 to 15 business days after dispatch. International delivery usually takes 10 to 25 business days depending on customs. Items in one order can arrive in separate parcels.'],
      ['Shipping cost', 'Shipping is calculated at checkout before you pay. {shippingLine}'],
      ['Duties and taxes', 'Orders shipped outside the United States may be charged import duties or taxes by your local customs office. Those charges are the buyer\'s responsibility.'],
    ],
  },
  returns: {
    title: 'Returns and refunds',
    body: [
      ['30-day returns', 'If something is not right, contact us within 30 days of delivery. Items need to be unused and in their original packaging.'],
      ['Damaged or wrong items', 'Send us a photo of the item and the shipping label within 7 days of delivery. We will send a replacement or refund you in full, and you will not need to ship the item back.'],
      ['Refunds', 'Approved refunds go back to your original payment method. PayPal usually shows the refund within 3 to 5 business days.'],
      ['How to start a return', 'Email {email} with your order number and the reason for the return. We reply with the next steps within 2 business days.'],
    ],
  },
  privacy: {
    title: 'Privacy',
    body: [
      ['What we collect', 'When you place an order we collect your name, email, phone number and shipping address so we can deliver it. Payment is handled by PayPal; {store} never sees or stores your card or bank details.'],
      ['How we use it', 'We use your details to fulfil your order, send it to the warehouse and carrier that deliver it, and answer your questions. We do not sell your information.'],
      ['Your cart', 'Your cart is stored in your own browser. We do not use advertising trackers.'],
      ['Your choices', 'Email {email} to ask for a copy of your order data or to have it deleted.'],
    ],
  },
  terms: {
    title: 'Terms of sale',
    body: [
      ['Orders', 'An order is confirmed once payment is completed. We may cancel and fully refund an order if an item is out of stock or was listed with an obvious pricing error.'],
      ['Product information', 'We work to keep descriptions, specifications and photos accurate. Always check that a product suits your job and meets your local building code before using it.'],
      ['Safe use', 'Tools and site equipment can cause injury. Follow the manufacturer\'s instructions and wear the right protective gear.'],
      ['Contact', 'Questions about an order go to {email}.'],
    ],
  },
};
