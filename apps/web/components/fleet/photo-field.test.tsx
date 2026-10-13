import { PHOTO_MAX_BYTES } from '@debus/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhotoField } from './photo-field';

jest.mock('../../hooks/use-photo', () => ({ usePhoto: () => null }));

const create = jest.fn(() => 'blob:preview');
const revoke = jest.fn();
beforeEach(() => {
  create.mockClear();
  revoke.mockClear();
  Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
});

const setup = (props: Partial<Parameters<typeof PhotoField>[0]> = {}) => {
  const onChange = jest.fn();
  const view = render(
    <PhotoField
      id="bus-photo"
      label="Foto del bus"
      value={null}
      onChange={onChange}
      fallback={<i>respaldo</i>}
      {...props}
    />,
  );
  return { onChange, ...view };
};
// A real picker offers every file when the person asks for it, so the test does too.
const user = userEvent.setup({ applyAccept: false });
const input = () => screen.getByLabelText('Foto del bus');

it('asks only for JPG, PNG or WebP files', () => {
  setup();

  expect(input()).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
  expect(screen.getByText('respaldo')).toBeInTheDocument();
});

it('hands over a valid picture', async () => {
  const { onChange } = setup();
  const file = new File(['x'], 'bus.jpg', { type: 'image/jpeg' });

  await user.upload(input(), file);

  expect(onChange).toHaveBeenCalledWith(file);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('refuses a PDF', async () => {
  const { onChange } = setup();

  await user.upload(input(), new File(['x'], 'bus.pdf', { type: 'application/pdf' }));

  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Sube una foto JPG, PNG o WebP de hasta 5 MB.',
  );
});

it('refuses a file of 6 MB', async () => {
  const { onChange } = setup();
  const big = new File(['x'], 'bus.jpg', { type: 'image/jpeg' });
  Object.defineProperty(big, 'size', { value: PHOTO_MAX_BYTES + 1024 * 1024 });

  await user.upload(input(), big);

  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Sube una foto JPG, PNG o WebP de hasta 5 MB.',
  );
});

it('previews the chosen picture and can take it back', async () => {
  const file = new File(['x'], 'bus.jpg', { type: 'image/jpeg' });
  const { onChange, unmount } = setup({ value: file });

  expect(screen.getByRole('img', { name: 'Vista previa de la foto' })).toHaveAttribute(
    'src',
    'blob:preview',
  );
  await user.click(screen.getByRole('button', { name: 'Quitar foto' }));
  expect(onChange).toHaveBeenCalledWith(null);

  unmount();
  await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:preview'));
});

it('offers to change the photo when there is one already', () => {
  setup({ currentPath: '/api/flota/buses/1/photo' });

  expect(screen.getByText('Cambiar foto')).toBeInTheDocument();
});

it('clears the error after a good picture', async () => {
  setup();
  await user.upload(input(), new File(['x'], 'bus.pdf', { type: 'application/pdf' }));
  expect(screen.getByRole('alert')).toBeInTheDocument();

  await user.upload(input(), new File(['x'], 'bus.png', { type: 'image/png' }));

  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
