import Head from 'next/head';
import { MyPage } from '../components/mypage/MyPage';

export default function MyProfilePage() {
  return (
    <>
      <Head>
        <title>My Page | MedConnect</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <MyPage />
    </>
  );
}
