import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { cached, TTL } from '../../lib/cache';
import { SkeletonCard, StatusBadge } from '../../components/UI';

const VERSES = [
  { ref: 'Matthew 28:19', text: 'Go therefore and make disciples of all nations, baptising them in the name of the Father and of the Son and of the Holy Spirit.' },
  { ref: 'Mark 16:15', text: 'Go into all the world and proclaim the gospel to the whole creation.' },
  { ref: 'Acts 1:8', text: 'You will receive power when the Holy Spirit has come upon you, and you will be my witnesses in Jerusalem and in all Judea and Samaria, and to the end of the earth.' },
  { ref: 'Romans 10:14', text: 'How then will they call on him in whom they have not believed? And how are they to believe in him of whom they have never heard? And how are they to hear without someone preaching?' },
  { ref: 'Isaiah 6:8', text: 'I heard the voice of the Lord saying, "Whom shall I send, and who will go for us?" Then I said, "Here I am! Send me."' },
  { ref: 'Proverbs 11:30', text: 'The fruit of the righteous is a tree of life, and whoever captures souls is wise.' },
  { ref: 'Luke 15:7', text: 'There will be more joy in heaven over one sinner who repents than over ninety-nine righteous persons who need no repentance.' },
  { ref: 'John 4:35', text: 'Look, I tell you, lift up your eyes, and see that the fields are white for harvest.' },
  { ref: '2 Corinthians 5:20', text: 'We are ambassadors for Christ, God making his appeal through us.' },
  { ref: 'Romans 1:16', text: 'I am not ashamed of the gospel, for it is the power of God for salvation to everyone who believes.' },
  { ref: 'Acts 4:12', text: 'There is salvation in no one else, for there is no other name under heaven given among men by which we must be saved.' },
  { ref: 'Ezekiel 3:18', text: 'If I say to the wicked, "You shall surely die," and you give him no warning — his blood I will require at your hand.' },
  { ref: 'Daniel 12:3', text: 'Those who are wise shall shine like the brightness of the sky above; and those who turn many to righteousness, like the stars forever and ever.' },
  { ref: '1 Corinthians 9:16', text: 'Woe to me if I do not preach the gospel!' },
  { ref: 'Matthew 9:37', text: 'The harvest is plentiful, but the labourers are few; therefore pray earnestly to the Lord of the harvest to send out labourers.' },
  { ref: 'Luke 19:10', text: 'For the Son of Man came to seek and to save the lost.' },
  { ref: 'Romans 10:17', text: 'So faith comes from hearing, and hearing through the word of Christ.' },
  { ref: '2 Timothy 4:2', text: 'Preach the word; be ready in season and out of season.' },
  { ref: 'Acts 2:21', text: 'Everyone who calls upon the name of the Lord shall be saved.' },
  { ref: 'John 3:16', text: 'For God so loved the world, that he gave his only Son, that whoever believes in him should not perish but have eternal life.' },
  { ref: '1 Peter 3:15', text: 'Always be prepared to make a defence to anyone who asks you for a reason for the hope that is in you.' },
  { ref: 'Colossians 4:5', text: 'Walk in wisdom toward outsiders, making the best use of the time.' },
  { ref: 'Acts 20:24', text: 'I do not account my life of any value nor as precious to myself, if only I may finish my course and the ministry I received from the Lord Jesus, to testify to the gospel of the grace of God.' },
  { ref: '2 Corinthians 4:5', text: "We proclaim Jesus Christ as Lord, with ourselves as your servants for Jesus' sake." },
  { ref: 'Mark 1:17', text: 'Follow me, and I will make you become fishers of men.' },
  { ref: 'Luke 24:47', text: 'Repentance for the forgiveness of sins should be proclaimed in his name to all nations, beginning from Jerusalem.' },
  { ref: 'John 17:18', text: 'As you sent me into the world, so I have sent them into the world.' },
  { ref: 'Acts 5:42', text: 'Every day, in the temple and from house to house, they did not cease teaching and preaching that the Christ is Jesus.' },
  { ref: 'Romans 15:20', text: 'I make it my ambition to preach the gospel, not where Christ has already been named.' },
  { ref: '1 Thessalonians 1:8', text: 'Your faith in God has gone forth everywhere, so that we need not say anything.' },
  { ref: 'Philippians 1:27', text: 'Let your manner of life be worthy of the gospel of Christ.' },
  { ref: 'Colossians 1:28', text: 'We proclaim him, warning everyone and teaching everyone with all wisdom, that we may present everyone mature in Christ.' },
  { ref: '2 Timothy 2:2', text: 'What you have heard from me in the presence of many witnesses entrust to faithful men, who will be able to teach others also.' },
  { ref: 'Acts 17:6', text: 'These men who have turned the world upside down have come here also.' },
  { ref: 'Isaiah 52:7', text: 'How beautiful upon the mountains are the feet of him who brings good news, who publishes peace.' },
  { ref: 'Psalm 96:3', text: 'Declare his glory among the nations, his marvellous works among all the peoples!' },
  { ref: 'Psalm 105:1', text: 'Give thanks to the Lord; call upon his name; make known his deeds among the peoples!' },
  { ref: 'Acts 13:47', text: 'I have made you a light for the Gentiles, that you may bring salvation to the ends of the earth.' },
  { ref: 'Isaiah 49:6', text: 'I will make you as a light for the nations, that my salvation may reach to the end of the earth.' },
  { ref: 'Matthew 5:14', text: 'You are the light of the world. A city set on a hill cannot be hidden.' },
  { ref: 'Matthew 5:16', text: 'Let your light shine before others, so that they may see your good works and give glory to your Father who is in heaven.' },
  { ref: 'Acts 26:18', text: 'To open their eyes, so that they may turn from darkness to light and from the power of Satan to God.' },
  { ref: 'John 1:12', text: 'To all who did receive him, who believed in his name, he gave the right to become children of God.' },
  { ref: '2 Corinthians 5:18', text: 'God reconciled us to himself through Christ and gave us the ministry of reconciliation.' },
  { ref: '2 Corinthians 5:19', text: 'In Christ God was reconciling the world to himself, entrusting to us the message of reconciliation.' },
  { ref: 'Ephesians 6:19', text: 'Pray for me, that words may be given to me in opening my mouth boldly to proclaim the mystery of the gospel.' },
  { ref: 'Philippians 2:15', text: 'Shine as lights in the world, holding fast to the word of life.' },
  { ref: 'Matthew 24:14', text: 'This gospel of the kingdom will be proclaimed throughout the whole world as a testimony to all nations, and then the end will come.' },
  { ref: 'Isaiah 61:1', text: 'The Spirit of the Lord God is upon me, because the Lord has anointed me to bring good news to the poor.' },
  { ref: 'Luke 4:18', text: 'The Spirit of the Lord is upon me, because he has anointed me to proclaim good news to the poor.' },
  { ref: 'Acts 8:4', text: 'Now those who were scattered went about preaching the word.' },
  { ref: 'Acts 11:21', text: 'The hand of the Lord was with them, and a great number who believed turned to the Lord.' },
  { ref: '1 Corinthians 1:17', text: 'Christ did not send me to baptise but to preach the gospel, and not with words of eloquent wisdom, lest the cross of Christ be emptied of its power.' },
  { ref: '1 Corinthians 2:2', text: 'I decided to know nothing among you except Jesus Christ and him crucified.' },
  { ref: 'Acts 14:1', text: 'At Iconium, they entered the synagogue and spoke in such a way that a great number of both Jews and Greeks believed.' },
  { ref: 'Acts 16:31', text: 'Believe in the Lord Jesus, and you will be saved, you and your household.' },
  { ref: 'Acts 28:31', text: 'Proclaiming the kingdom of God and teaching about the Lord Jesus Christ with all boldness and without hindrance.' },
  { ref: 'Romans 10:15', text: 'How beautiful are the feet of those who preach the good news!' },
  { ref: 'Isaiah 40:9', text: 'Get up on a high mountain, O Zion, herald of good news; lift up your voice with strength, O Jerusalem, herald of good news; lift it up, fear not.' },
  { ref: 'Jeremiah 1:7', text: 'Go to all to whom I send you, and whatever I command you, you shall speak.' },
  { ref: 'Ezekiel 33:7', text: 'Son of man, I have made you a watchman for the house of Israel. Whenever you hear a word from my mouth, you shall give them warning from me.' },
  { ref: 'Joel 2:32', text: 'Everyone who calls on the name of the Lord shall be saved.' },
  { ref: 'Jonah 3:2', text: 'Arise, go to Nineveh, that great city, and call out against it the message that I tell you.' },
  { ref: 'Habakkuk 2:14', text: 'The earth will be filled with the knowledge of the glory of the Lord as the waters cover the sea.' },
  { ref: 'John 20:21', text: 'As the Father has sent me, even so I am sending you.' },
  { ref: 'Matthew 10:7', text: 'Proclaim as you go, saying, "The kingdom of heaven is at hand."' },
  { ref: 'Matthew 10:32', text: 'Everyone who acknowledges me before men, I also will acknowledge before my Father who is in heaven.' },
  { ref: 'Luke 10:2', text: 'The harvest is plentiful, but the labourers are few. Therefore pray earnestly to the Lord of the harvest to send out labourers into his harvest.' },
  { ref: 'Luke 15:4', text: 'What man of you, having a hundred sheep, if he has lost one of them, does not leave the ninety-nine in the open country, and go after the one that is lost, until he finds it?' },
  { ref: 'Luke 15:10', text: 'There is joy before the angels of God over one sinner who repents.' },
  { ref: 'John 6:44', text: 'No one can come to me unless the Father who sent me draws him.' },
  { ref: 'John 10:16', text: 'I have other sheep that are not of this fold. I must bring them also, and they will listen to my voice.' },
  { ref: 'Acts 2:47', text: 'The Lord added to their number day by day those who were being saved.' },
  { ref: 'Acts 6:7', text: 'The word of God continued to increase, and the number of the disciples multiplied greatly in Jerusalem.' },
  { ref: 'Acts 9:31', text: 'The church throughout all Judea and Galilee and Samaria had peace and was being built up. Walking in the fear of the Lord and in the comfort of the Holy Spirit, it multiplied.' },
  { ref: 'Romans 10:1', text: "My heart's desire and prayer to God for them is that they may be saved." },
  { ref: '1 Corinthians 3:9', text: "We are God's fellow workers. You are God's field, God's building." },
  { ref: '1 Corinthians 9:22', text: 'I have become all things to all people, that by all means I might save some.' },
  { ref: '1 Corinthians 15:58', text: 'Be steadfast, immovable, always abounding in the work of the Lord, knowing that in the Lord your labour is not in vain.' },
  { ref: '2 Corinthians 6:2', text: 'Behold, now is the favourable time; behold, now is the day of salvation.' },
  { ref: 'Ephesians 5:16', text: 'Make the best use of the time, because the days are evil.' },
  { ref: 'Colossians 4:3', text: 'Pray also for us, that God may open to us a door for the word, to declare the mystery of Christ.' },
  { ref: 'Colossians 4:6', text: 'Let your speech always be gracious, seasoned with salt, so that you may know how you ought to answer each person.' },
  { ref: '1 Thessalonians 2:4', text: 'We have been approved by God to be entrusted with the gospel, so we speak, not to please man, but to please God who tests our hearts.' },
  { ref: '2 Thessalonians 3:1', text: 'Pray for us, that the word of the Lord may speed ahead and be honoured.' },
  { ref: '2 Timothy 4:5', text: 'Do the work of an evangelist, fulfil your ministry.' },
  { ref: 'Titus 2:11', text: 'The grace of God has appeared, bringing salvation for all people.' },
  { ref: 'Hebrews 2:3', text: 'How shall we escape if we neglect such a great salvation?' },
  { ref: 'James 5:20', text: 'Whoever brings back a sinner from his wandering will save his soul from death and will cover a multitude of sins.' },
  { ref: '1 Peter 2:9', text: 'You are a chosen race, a royal priesthood, a holy nation, a people for his own possession, that you may proclaim the excellencies of him who called you out of darkness into his marvellous light.' },
  { ref: 'Jude 23', text: 'Save others by snatching them out of the fire.' },
  { ref: 'Revelation 22:17', text: 'The Spirit and the Bride say, "Come." And let the one who hears say, "Come." Let the one who is thirsty come.' },
  { ref: 'Nahum 1:15', text: 'Behold, upon the mountains, the feet of him who brings good news, who publishes peace!' },
  { ref: 'Romans 8:19', text: 'The creation waits with eager longing for the revealing of the sons of God.' },
  { ref: 'Revelation 14:6', text: 'I saw another angel flying directly overhead, with an eternal gospel to proclaim to those who dwell on earth, to every nation and tribe and language and people.' },
  { ref: 'Zechariah 8:23', text: 'In those days ten men from all the nations shall take hold of the robe of a Jew, saying, "Let us go with you, for we have heard that God is with you."' },
];

function FlameIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="var(--gold)" stroke="none">
      <path d="M12 2c0 0-5 4.5-5 9a5 5 0 0010 0C17 6.5 12 2 12 2zm0 13a2 2 0 110-4 2 2 0 010 4z"/>
    </svg>
  );
}

export default function VolunteerHome({ pending, syncing, onSync, onNav, onOpenContact }) {
  const navigate = useNavigate();
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [recent, setRecent]   = useState([]);
  const [pendingMsg,  setPendingMsg]  = useState(0);
  const [queueCount, setQueueCount]  = useState(0);

  const verse = useMemo(() => {
    const key = 'reach-verse-session';
    try {
      const stored = sessionStorage.getItem(key);
      if (stored !== null) return VERSES[parseInt(stored)] || VERSES[0];
    } catch {}
    const idx = Math.floor(Math.random() * VERSES.length);
    try { sessionStorage.setItem(key, String(idx)); } catch {}
    return VERSES[idx];
  }, []);

  useEffect(() => {
    cached('vol:dashboard', () => api.getVolunteerDashboard(), TTL.HUB_DASH)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));

    cached('contacts:mine', () => api.listContacts(), TTL.CONTACTS)
      .then(d => setRecent((d.contacts || []).slice(0, 5)))
      .catch(() => {});

    // Prefetch contacts after 1.5s idle
    const t = setTimeout(() =>
      cached('contacts:mine', () => api.listContacts(), TTL.CONTACTS).catch(() => {}),
    1500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    api.listContacts('needs_message')
      .then(d => setPendingMsg(d.contacts?.length || 0))
      .catch(() => {});
    api.getCallQueue()
      .then(d => setQueueCount(d.contacts?.length || 0))
      .catch(() => {});
  }, []);

  const stats = data || { total_contacts: 0, confirmed: 0, awaiting: 0, unreached: 0, streak_days: 0 };

  if (loading) return (
    <div className="page-body">
      <SkeletonCard /><SkeletonCard /><SkeletonCard />
    </div>
  );

  return (
    <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Sync badge */}
      {(pending > 0 || syncing) && (
        <div
          onClick={onSync}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--bg-2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '8px 12px', cursor: 'pointer',
          }}
        >
          <span className={`sync-dot ${syncing ? '' : 'pending'}`} />
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
            {syncing ? 'Syncing…' : `${pending} pending`}
          </span>
        </div>
      )}

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.total_contacts}</div>
          <div className="stat-label">Total Contacts</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--green)' }}>{stats.confirmed}</div>
          <div className="stat-label">Confirmed</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.awaiting}</div>
          <div className="stat-label">Msg Sent</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.unreached}</div>
          <div className="stat-label">Unreached</div>
        </div>
      </div>

      {/* Streak */}
      {stats.streak_days > 0 && (
        <div className="streak-card">
          <FlameIcon />
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span className="streak-number">{stats.streak_days}</span>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--text-2)' }}>day streak</span>
            </div>
            <div className="streak-label">Keep adding contacts daily!</div>
          </div>
        </div>
      )}

      {/* Add Contact CTA */}
      <button
        className="btn btn-primary btn-full"
        onClick={() => onNav('add')}
        style={{ height: 48, fontSize: 15 }}
      >
        + Add Contact
      </button>

      {pendingMsg > 0 && (
        <button
          className="btn btn-outline btn-full"
          style={{ marginBottom: 8 }}
          onClick={() => navigate('/vol/contacts', { state: { filter: 'needs_message' } })}
        >
          📱 {pendingMsg} contact{pendingMsg !== 1 ? 's' : ''} waiting for WhatsApp
        </button>
      )}
      {queueCount > 0 && (
        <button
          className="btn btn-ghost btn-full"
          style={{ fontSize: 13 }}
          onClick={() => navigate('/vol/queue')}
        >
          📞 Start Call Queue ({queueCount})
        </button>
      )}

      {/* Recent contacts */}
      {recent.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
            Recent
          </div>
          <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            {recent.map(c => (
              <div key={c.id} className="contact-row" onClick={() => onOpenContact ? onOpenContact(c.id) : onNav('contacts')}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="contact-name">{c.name}</div>
                  <div className="contact-loc">{c.location}</div>
                </div>
                <StatusBadge status={c.current_status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Verse */}
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
        <div style={{ fontSize: 13, color: 'var(--text-2)', fontStyle: 'italic', lineHeight: 1.6, marginBottom: 8 }}>
          "{verse.text}"
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-sans)', fontWeight: 500 }}>{verse.ref}</div>
      </div>
    </div>
  );
}
