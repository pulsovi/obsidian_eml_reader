interface Address {
  address: string;
  name: string;
}

export function addressToHtml (address: Address | Address[]): string {
  if (Array.isArray(address)) {
    if (address.length < 1) return '<span class="mp_address_group"></span>';
    if (address.length === 1) return addressToHtml(address[0]);
    return `<ul><li>${address.map(addressToHtml).join('</li><li>')}</li></ul>`;
  }
  const name = address.name ? `<span class="mp_address_name">${address.name}</span> ` : '';
  const mailto = `<a href="mailto:${address.address}" class="mp_address_email">${address.address}</a>`;
  return name
    ? `<span class="mp_address_group">${name} &lt;${mailto}&gt;</span>`
    : `<span class="mp_address_group">${mailto}</span>`
  ;
}
