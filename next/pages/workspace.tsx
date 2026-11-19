import Head from 'next/head';
import { WorkspacePage } from '../components/workspace/WorkspacePage';
export default function Workspace() {
  return (
    <>
      <Head>
        <title>Care workspace | MedConnect</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <WorkspacePage />
    </>
  );
}
