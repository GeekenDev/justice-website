import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Dataset 9 Details",
  description: "Detailed notes and reconstruction context for DataSet 9.",
  alternates: {
    canonical: "/dataset-9-details",
  },
};

const missingFiles = [
  "EFTA00709804",
  "EFTA00709805",
  "EFTA00709806",
  "EFTA00709807",
  "EFTA00770595",
  "EFTA00774768",
  "EFTA00823190",
  "EFTA00823191",
  "EFTA00823192",
  "EFTA00823221",
  "EFTA00823319",
  "EFTA00877475",
  "EFTA00892252",
  "EFTA00901740",
  "EFTA00912980",
  "EFTA00919433",
  "EFTA00919434",
  "EFTA00932520",
  "EFTA00932521",
  "EFTA00932522",
  "EFTA00932523",
  "EFTA01135215",
  "EFTA01135708",
];

export default function Dataset9DetailsPage() {
  return (
    <main className="app-shell dataset9-page">
      <div className="glow glow-left" />
      <div className="glow glow-right" />

      <section className="hero">
        <p className="eyebrow">Dataset Notes</p>
        <h1>Dataset 9 Details</h1>
      </section>

      <section className="panel detail-nav link-bar">
        <Link href="/" className="table-link">
          Back to Dashboard
        </Link>
        <Link href="/archive-downloads" className="table-link">
          Back to Archive Downloads
        </Link>
      </section>

      <section className="panel detail-list">
        <h2>Standard disclaimers regarding DataSet 9</h2>
        <p>
          Right then, much of the contents of these files are frankly not
          suitable for viewing. A good many people have claimed DataSet 9
          contains CSAM. I&apos;m operating under the assumption that the US DOJ
          couldn&apos;t possibly be so daft as to publish CSAM for the entire
          world to download at the behest of Congress and President Trump.
          It&apos;s assumed that any and all pictures/videos depicting nudity
          are of legal age. If they did in fact publish CSAM, this is gross
          negligence and those responsible for their release should be referred
          to the US OIG/AG to be investigated.
        </p>

        <h2>Personal Thoughts</h2>
        <p>
          I&apos;ve given this a great deal of thought, whether to upload this
          at all, and I feel it&apos;s in everyone&apos;s best interest that
          these files are made available to the global public. Paedophiles have
          no place in our society, but there&apos;s so much more to this case as
          we&apos;re all learning in real-time. Keep on the charge, keep
          searching for the truth, share information, ask all the questions,
          stay focused and pay attention to the information that we have,
          don&apos;t get stuck in a hole chasing your agenda. The victims
          deserve justice and we deserve the truth.
        </p>

        <h2>Directory Explanation</h2>
        <ul className="directory-explanation">
          <li>
            <strong>MISSING-NATIVES</strong> - &apos;No Image Produced&apos;
            files, this is all remaining missing NATIVES, separated from IMAGES
            for the sake of navigation
          </li>
          <li>
            <strong>NATIVES</strong> - Non-PDF document files, missing 240 based
            on placeholder PDF files, I not believe the DOJ ever uploaded 237 of
            these NATIVES files.
          </li>
          <li>
            <strong>IMAGES</strong> - PDF files - documents/pictures. All
            &apos;No Image Produced&apos; and &apos;Natives Placeholder&apos;
            PDF that have the actual native were removed, as they are not the
            real files of evidence.
          </li>
          <li>
            <strong>EMPTY</strong> - Discovered NATIVES with 0B size, non-valid,
            added for posterity. I believe these were failed uploads from the
            DOJ and were never available publicly.
          </li>
          <li>
            <strong>CORRUPTED</strong> - These are known corrupted files. There
            are other NATIVES that will play as video files, but will not
            produce an image, these may possibly be re-encoded to produce the
            video as well, they were left in the NATIVES directory.
          </li>
          <li>
            <strong>DATA</strong> - VOL00009.OPT &amp; VOL00009.DAT from
            previous torrent download, added for posterity.
          </li>
          <li>
            <strong>DB-EXTRACT</strong> - Two DB files (EFTA01242504.db &amp;
            EFTA01242503.db) in natives, these are the images that were
            extracted from them. These are not SQLite databases - they&apos;re
            OLE2 Compound Document files.
          </li>
        </ul>
      </section>

      <section className="panel">
        <header className="results-head">
          <h2>Folder Contents</h2>
        </header>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Directory</th>
                <th>Files</th>
                <th>Size</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>NATIVES</td>
                <td>2,303</td>
                <td>84.8 GiB (91,080,562,692)</td>
              </tr>
              <tr>
                <td>MISSING-NATIVES</td>
                <td>242</td>
                <td>582.5 KiB (596,530)</td>
              </tr>
              <tr>
                <td>IMAGES</td>
                <td>528,740</td>
                <td>94.5 GiB (101,487,257,606)</td>
              </tr>
              <tr>
                <td>EMPTY</td>
                <td>31</td>
                <td>1.0 KiB (1,059)</td>
              </tr>
              <tr>
                <td>DB-EXTRACT</td>
                <td>83</td>
                <td>208.8 KiB (213,853)</td>
              </tr>
              <tr>
                <td>DATA</td>
                <td>2</td>
                <td>84.1 MiB (88,200,861)</td>
              </tr>
              <tr>
                <td>CORRUPTED</td>
                <td>2</td>
                <td>1.9 GiB (2,018,639,994)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel detail-list">
        <h2>
          Missing Files Based on (range: EFTA00039025 - EFTA01262781). <br />I
          do not believe these were ever uploaded to the DOJ website
        </h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>EFTA ID</th>
              </tr>
            </thead>
            <tbody>
              {missingFiles.map((file) => (
                <tr key={file}>
                  <td className="mono">{file}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <header className="results-head">
          <h2>
            10.1GB of Video Files Removed from the DOJ website, still missing.
            <br /> I believe these are the only files still missing from what
            the DOJ actually uploaded from the initial release
          </h2>
        </header>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>filename</th>
                <th>extension</th>
                <th>full_url</th>
                <th>content_type</th>
                <th>content_length</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="mono">EFTA00276494</td>
                <td>ts</td>
                <td>
                  <a
                    href="https://www.justice.gov/epstein/files/DataSet%209/EFTA00276494.ts"
                    target="_blank"
                    rel="noreferrer"
                    className="table-link"
                  >
                    https://www.justice.gov/epstein/files/DataSet%209/EFTA00276494.ts
                  </a>
                </td>
                <td>video/vnd.dlna.mpeg-tts</td>
                <td>4286578688</td>
              </tr>
              <tr>
                <td className="mono">EFTA01244748</td>
                <td>wmv</td>
                <td>
                  <a
                    href="https://www.justice.gov/epstein/files/DataSet%209/EFTA01244748.wmv"
                    target="_blank"
                    rel="noreferrer"
                    className="table-link"
                  >
                    https://www.justice.gov/epstein/files/DataSet%209/EFTA01244748.wmv
                  </a>
                </td>
                <td>video/x-ms-wmv</td>
                <td>3898308247</td>
              </tr>
              <tr>
                <td className="mono">EFTA01244749</td>
                <td>wmv</td>
                <td>
                  <a
                    href="https://www.justice.gov/epstein/files/DataSet%209/EFTA01244749.wmv"
                    target="_blank"
                    rel="noreferrer"
                    className="table-link"
                  >
                    https://www.justice.gov/epstein/files/DataSet%209/EFTA01244749.wmv
                  </a>
                </td>
                <td>video/x-ms-wmv</td>
                <td>2878425893</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
