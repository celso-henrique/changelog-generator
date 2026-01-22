import axios from "axios";

async function getConfluencePage() {
    const required = ["CONFLUENCE_BASE_URL", "CONFLUENCE_PAGE_ID", "CONFLUENCE_EMAIL", "CONFLUENCE_API_TOKEN"];
    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
        throw new Error(`Missing Confluence environment variables: ${missing.join(", ")}`);
    }

    const url = `${process.env.CONFLUENCE_BASE_URL}/wiki/rest/api/content/${process.env.CONFLUENCE_PAGE_ID}?expand=body.storage,version,title`;

    try {
        const { data } = await axios.get(url, {
            auth: {
                username: process.env.CONFLUENCE_EMAIL,
                password: process.env.CONFLUENCE_API_TOKEN,
            },
        });

        return data;
    } catch (error) {
        if (error.response?.status === 401) {
            throw new Error("Confluence authentication failed. Check CONFLUENCE_EMAIL and CONFLUENCE_API_TOKEN.");
        }
        if (error.response?.status === 404) {
            throw new Error(`Confluence page not found. Check CONFLUENCE_PAGE_ID: ${process.env.CONFLUENCE_PAGE_ID}`);
        }
        throw new Error(`Failed to get Confluence page: ${error.message}`);
    }
}

async function updateConfluencePage(newSectionHtml) {
    try {
        const page = await getConfluencePage();

        const updatedBody =
            newSectionHtml + page.body.storage.value;

        const payload = {
            id: page.id,
            type: "page",
            title: page.title,
            version: {
                number: page.version.number + 1,
            },
            body: {
                storage: {
                    value: updatedBody,
                    representation: "storage",
                },
            },
        };

        await axios.put(
            `${process.env.CONFLUENCE_BASE_URL}/wiki/rest/api/content/${page.id}`,
            payload,
            {
                auth: {
                    username: process.env.CONFLUENCE_EMAIL,
                    password: process.env.CONFLUENCE_API_TOKEN,
                },
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );
    } catch (error) {
        if (error.response?.status === 409) {
            throw new Error("Confluence page was modified by another user. Please try again.");
        }
        throw error;
    }
}

export { updateConfluencePage };