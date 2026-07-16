function profile() {
    return (
        <div>
            <h1>Last fm api key</h1>
            <input
                type="text"
                placeholder="LastFm Api key"
                className="rounded-md w-80 pl-2 pr-8 h-8 text-sm text-accent-foreground placeholder:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-accent-foreground"
            ></input>
        </div>
    )
}

export default profile