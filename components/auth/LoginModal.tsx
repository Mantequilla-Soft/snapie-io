'use client';
import { AiohaModal } from '@aioha/react-ui';
import { Providers } from '@aioha/aioha';
import './login-modal.css';

interface LoginModalProps {
  displayed: boolean;
  onLogin: (loginResult: any) => void;
  onClose: () => void;
  loginTitle?: string;
  loginOptions?: any;
  forceShowProviders?: Providers[];
}

export default function LoginModal({
  displayed,
  onLogin,
  onClose,
  loginTitle = 'Login',
  loginOptions,
  forceShowProviders,
}: LoginModalProps) {
  return (
    <AiohaModal
      displayed={displayed}
      onLogin={onLogin}
      onClose={onClose}
      loginTitle={loginTitle}
      loginOptions={loginOptions}
      forceShowProviders={forceShowProviders}
    />
  );
}
