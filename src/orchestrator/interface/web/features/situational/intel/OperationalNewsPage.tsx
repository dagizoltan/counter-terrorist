import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * News Feed Page
 * Detailed tactical signals and global intelligence archive.
 */
export const NewsPage = (props: { status: any, csrfToken?: string }) => {
  return (
    <Layout title="Tactical News // Intelligence Feed" islandPaths={[
      '/components/islands/NewsFeed.js'
    ]} csrfToken={props.csrfToken}>
      
      <header class="page-header">
        <div class="title-group">
          <h1>Tactical_News</h1>
          <span class="subtitle">Global Signal Intelligence & Operational Feed // OSINT Synched</span>
        </div>
      </header>

      <div class="grid grid-cols-12 gap-6 mb-8">
        <div class="col-span-12">
            <news-feed detailed="true" limit="100"></news-feed>
        </div>
      </div>
    </Layout>
  );
};
