import { redirect } from 'next/navigation';
import StatusRedirect from './page';

jest.mock('next/navigation', () => ({ redirect: jest.fn() }));

it('sends the old address to the status inside the admin panel', () => {
  StatusRedirect();

  expect(redirect).toHaveBeenCalledWith('/admin/estado');
});
