import { describe, expect, it } from 'vitest';
import { disallowedLinks, normalizeLink, replyLinks } from './reply-links.logic';

const KNOWLEDGE = [
  '<knowledge>',
  '<document name="menu.pdf">',
  'สั่งออนไลน์ได้ที่ https://www.shop-example.co.th/order/',
  'ดูเมนูเต็มที่ shop-example.co.th/menu (อัปเดตทุกเดือน)',
  'เพจ: www.facebook.com/ShopExample',
  'อีเมล hello@shop-example.co.th',
  '</document>',
  '</knowledge>',
].join('\n');
const INSTRUCTIONS = 'ถ้าผู้ใช้ถามเรื่องสาขา ให้ส่ง https://maps.example.com/shop?id=42 ไป';

const blocked = (reply: string): string[] => disallowedLinks(reply, [KNOWLEDGE, INSTRUCTIONS]);

describe('replyLinks', () => {
  it.each([
    ['https://evil.example/pay', ['https://evil.example/pay']],
    ['HTTP://EVIL.EXAMPLE/Pay', ['HTTP://EVIL.EXAMPLE/Pay']],
    ['กดที่ www.evil.example นะคะ', ['www.evil.example']],
    ['ไปที่ evil.example/x แล้วกรอก', ['evil.example/x']],
    ['ลิงก์ (https://evil.example/a_(b)) ค่ะ', ['https://evil.example/a_(b)']],
    ['"https://evil.example/q?a=1&b=2", ok.', ['https://evil.example/q?a=1&b=2']],
    ['ดูที่https://evil.example/xค่ะ', ['https://evil.example/x']],
    ['สองลิงก์ bit.ly/abc และ http://1.2.3.4/x', ['bit.ly/abc', 'http://1.2.3.4/x']],
  ])('finds the link in %j', (reply, expected) => {
    expect(replyLinks(reply)).toEqual(expected);
  });

  it.each([
    'ราคา 1,250.50 บาท ส่วนลด 10.5% ค่ะ',
    'เปิด 10.30-20.00 น. วันจันทร์ถึงศุกร์ (จ.-ศ.) และ 9.00/18.00 วันหยุด',
    'คะแนน 4.5/5 ขนาด S/M/L รุ่น v2.1/3',
    'ติดต่อ hello@shop-example.co.th หรือ sales.team@example.com ได้เลยค่ะ',
    'โทร 02-123-4567 หรือ LINE @shopexample',
    'เวลา 9 a.m./5 p.m. และ e.g./i.e. ไม่ใช่ลิงก์',
    'ไฟล์ menu.pdf อยู่ในคลังแล้ว',
  ])('finds nothing in %j', (reply) => {
    expect(replyLinks(reply)).toEqual([]);
  });
});

describe('normalizeLink', () => {
  it('ignores scheme, www., case, a trailing slash and trailing punctuation', () => {
    for (const url of [
      'https://www.Shop-Example.co.th/Order/',
      'http://shop-example.co.th/order',
      'www.shop-example.co.th/order/.',
      'shop-example.co.th/ORDER,',
    ]) {
      expect(normalizeLink(url)).toBe('shop-example.co.th/order');
    }
    expect(normalizeLink('https://shop.example/menu/?a=1')).toBe('shop.example/menu?a=1');
  });
});

describe('disallowedLinks', () => {
  it('allows a reply without links, including prices, times and e-mail addresses', () => {
    expect(blocked('ราคา 120.00 บาท เปิด 10.30 น. อีเมล hello@shop-example.co.th ค่ะ')).toEqual([]);
  });

  it.each([
    'สั่งได้ที่ https://www.shop-example.co.th/order/ ค่ะ',
    'สั่งได้ที่ shop-example.co.th/order ค่ะ',
    'สั่งได้ที่ HTTPS://SHOP-EXAMPLE.CO.TH/ORDER.',
    'เมนูอยู่ที่ https://shop-example.co.th/menu ค่ะ',
    'เพจของร้าน https://facebook.com/shopexample/ นะคะ',
    'แผนที่สาขา “https://maps.example.com/shop?id=42” ค่ะ',
    'สั่งได้ที่ https://www.shop-example.co.th ค่ะ',
  ])('allows a link the shop wrote: %j', (reply) => {
    expect(blocked(reply)).toEqual([]);
  });

  it.each([
    ['โอนเงินที่ https://evil.example/pay ค่ะ', ['https://evil.example/pay']],
    ['ดูโปรที่ bit.ly/free-gift นะคะ', ['bit.ly/free-gift']],
    ['สั่งได้ที่ https://shop-example.co.th/order/pay ค่ะ', ['https://shop-example.co.th/order/pay']],
    ['แผนที่ https://maps.example.com/shop?id=43', ['https://maps.example.com/shop?id=43']],
    ['ร้านปลอม https://notshop-example.co.th/order', ['https://notshop-example.co.th/order']],
    ['อันนี้ได้ https://shop-example.co.th/menu แต่อันนี้ไม่ได้ www.evil.example', ['www.evil.example']],
  ])('blocks a link the admin never wrote: %j', (reply, expected) => {
    expect(blocked(reply)).toEqual(expected);
  });

  it('blocks every link when the knowledge base and instructions have none', () => {
    expect(disallowedLinks('ดูที่ https://shop.example/x', ['', 'ไม่มีลิงก์'])).toEqual([
      'https://shop.example/x',
    ]);
  });

  it('does not treat a link inside an e-mail address in the sources as written by the shop', () => {
    expect(disallowedLinks('ดูที่ example.com/x', ['อีเมล a@example.com/x'])).toEqual([
      'example.com/x',
    ]);
  });
});
