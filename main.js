const Apify = require('apify');

const sourceUrl = 'https://www.mohfw.gov.in/';
const LATEST = 'LATEST';
let check = false;

Apify.main(async () => {

    const kvStore = await Apify.openKeyValueStore('COVID-19-IN');
    const dataset = await Apify.openDataset('COVID-19-IN-HISTORY');
    const { email } = await Apify.getValue('INPUT');

    console.log('Launching Puppeteer...');
    const browser = await Apify.launchPuppeteer();

    const page = await browser.newPage();
    await Apify.utils.puppeteer.injectJQuery(page);

    console.log('Going to the website...');
    await page.goto(sourceUrl), { waitUntil: 'networkidle0', timeout: 600000 };

    console.log('Getting data...');

    const result = await page.evaluate(() => {
        const now = new Date();

        const activeCases = $('body > div.main-section > div > div.contribution.col-sm-9 > div > div > div:nth-child(2) > div > span').text();
        const recovered = $("body > div.main-section > div > div.contribution.col-sm-9 > div > div > div:nth-child(3) > div > span").text();
        const deaths = $('body > div.main-section > div > div.contribution.col-sm-9 > div > div > div:nth-child(4) > div > span').text();
        
        const data = {
            activeCases: activeCases,
            recovered: recovered,
            deaths: deaths,
            totalCases: parseInt(activeCases) + parseInt(recovered) + parseInt(deaths),
            sourceUrl: 'https://www.mohfw.gov.in/',
            lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
            readMe: 'https://github.com/zpelechova/covid-in/blob/master/README.md',
        };
        return data;

    });

    console.log(result)

    if (!result.activeCases || !result.deaths || !result.recovered) {
        check = true;
    }
    else {
        let latest = await kvStore.getValue(LATEST);
        if (!latest) {
            await kvStore.setValue('LATEST', result);
            latest = result;
        }
        delete latest.lastUpdatedAtApify;
        const actual = Object.assign({}, result);
        delete actual.lastUpdatedAtApify;

        if (JSON.stringify(latest) !== JSON.stringify(actual)) {
            await dataset.pushData(result);
        }

        await kvStore.setValue('LATEST', result);
        await Apify.pushData(result);
    }


    console.log('Closing Puppeteer...');
    await browser.close();
    console.log('Done.');

    // if there are no data for activeCases etc., send email, because that means something is wrong
    const env = await Apify.getEnv();
    if (check) {
        await Apify.call(
            'apify/send-mail',
            {
                to: email,
                subject: `Covid-19 IN from ${env.startedAt} failed `,
                html: `Hi, ${'<br/>'}
                        <a href="https://my.apify.com/actors/${env.actorId}#/runs/${env.actorRunId}">this</a> 
                        run had 0 TotalInfected, check it out.`,
            },
            { waitSecs: 0 },
        );
    };
});
