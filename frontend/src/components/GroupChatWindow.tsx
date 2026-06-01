import type { Group } from "../components/Sidebar";
import ChatHeader from "./ChatHeader";

type Props = {
  group: Group;
  onBack: () => void;
};

export default function GroupChatWindow({ group }: Props) {
  return (
    <div className="flex-1 flex flex-col p-4 text-white">
      
      {/* HEADER */}
      <ChatHeader type="group" group={group} />
      {/* <div className="flex items-center gap-3 border-b border-white/10 pb-3">
        <button onClick={onBack} className="text-purple-400">
          ← Back
        </button>

        <div>
          <h2 className="text-xl font-bold">{group.name}</h2>
          <p className="text-sm text-gray-400">
            {group.members.length} members
          </p>
        </div>
      </div> */}

      {/* MEMBERS LIST */}
      <div className="mt-4">
        <h3 className="text-sm text-gray-400 mb-2">Members</h3>

        <div className="space-y-3">
          {group.members.map((m: any) => (
            <div
              key={m._id}
              className="flex items-center gap-3 bg-white/5 p-2 rounded-lg"
            >
              <img
                src={m.avatar}
                className="w-8 h-8 rounded-full"
              />

              <span className="text-white">{m.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}